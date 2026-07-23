import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, auth, firebaseConfig } from '../firebaseConfig';
import { useAuth } from '../contexts/AuthContext';
import { isUserAdmin } from '../config/admins';
import ScoringForm from './ScoringForm';
import * as XLSX from 'xlsx';
import './ScreeningAdmin.css';

const getDecisionWeight = (decision, autoDisqualified) => {
    if (autoDisqualified) return 0;
    const d = (decision || '').toLowerCase();
    if (d === 'accept') return 4;
    if (d === 'pending') return 3;
    if (d === 'reject') return 2;
    return 1;
};

const compareScoreAndDecision = (appX, appY, scX, scY) => {
    const rx = scX?.rankInCountry ? Number(scX.rankInCountry) : 9999;
    const ry = scY?.rankInCountry ? Number(scY.rankInCountry) : 9999;
    if (rx !== ry) return rx - ry;

    const scoreX = scX?.totalScore !== undefined ? Number(scX.totalScore) : (appX.autoDisqualified ? -1 : 0);
    const scoreY = scY?.totalScore !== undefined ? Number(scY.totalScore) : (appY.autoDisqualified ? -1 : 0);
    if (scoreX !== scoreY) return scoreY - scoreX;

    const dwX = getDecisionWeight(scX?.decision, appX.autoDisqualified);
    const dwY = getDecisionWeight(scY?.decision, appY.autoDisqualified);
    if (dwX !== dwY) return dwY - dwX;

    return (appX.name || '').localeCompare(appY.name || '');
};

const ScreeningAdmin = () => {
    const { currentUser } = useAuth();
    const [selectedYear, setSelectedYear] = useState('2026');
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState('');
    const [importAuditReport, setImportAuditReport] = useState(null);
    const [activeAuditTab, setActiveAuditTab] = useState('duplicates');

    const [applicants, setApplicants] = useState([]);
    const [scores, setScores] = useState({});
    const [assignments, setAssignments] = useState([]);
    const [uniqueCohorts, setUniqueCohorts] = useState([]);
    const [loading, setLoading] = useState(true);

    // Admin filters
    const [selectedCohort, setSelectedCohort] = useState('All');
    const [statusFilter, setStatusFilter] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedApplicant, setSelectedApplicant] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // New assignment input
    const [selectedScreenerToEdit, setSelectedScreenerToEdit] = useState('');
    const [newScreenerEmail, setNewScreenerEmail] = useState('');
    const [newScreenerName, setNewScreenerName] = useState('');
    const [selectedCountriesForAssign, setSelectedCountriesForAssign] = useState([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const appCollName = `applicants_${selectedYear}`;
            const scoreCollName = selectedYear === '2026' ? 'screening_scores' : `screening_scores_${selectedYear}`;

            // 1. Fetch Applicants
            const appSnap = await getDocs(collection(db, "alumni", "screening_data", appCollName));
            const appList = appSnap.docs.map(d => ({ ...d.data(), id: d.id }));

            // 2. Fetch Scores
            const scoreSnap = await getDocs(collection(db, "alumni", "screening_data", scoreCollName));
            const scoreMap = {};
            scoreSnap.docs.forEach(d => {
                const data = d.data();
                if (data.applicantId) {
                    scoreMap[data.applicantId] = { ...data, id: d.id };
                }
            });

            // 3. Fetch Assignments
            const assignSnap = await getDocs(collection(db, "alumni", "screening_data", "screening_assignments"));
            const assignList = assignSnap.docs.map(d => ({ ...d.data(), id: d.id }));

            const cohorts = [...new Set(appList.map(a => a.cohort || a.countryOfResidence).filter(Boolean))].sort();

            setApplicants(appList);
            setScores(scoreMap);
            setAssignments(assignList);
            setUniqueCohorts(cohorts);

        } catch (err) {
            console.error("Error fetching admin data:", err);
            alert(`Failed to load administration data for ${selectedYear}.`);
        } finally {
            setLoading(false);
        }
    }, [selectedYear]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleToggleCountryForAssign = (c) => {
        setSelectedCountriesForAssign(prev => 
            prev.includes(c) ? prev.filter(item => item !== c) : [...prev, c]
        );
    };

    const handleSaveAssignment = async (e) => {
        e.preventDefault();
        if (!newScreenerEmail.trim()) {
            alert("Please enter screener email address.");
            return;
        }

        const assignId = newScreenerEmail.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
        const payload = {
            id: assignId,
            visitorId: assignId,
            screenerEmail: newScreenerEmail.trim().toLowerCase(),
            screenerName: newScreenerName.trim() || newScreenerEmail.trim(),
            assignedCountries: selectedCountriesForAssign,
            assignedAt: new Date().toISOString()
        };

        try {
            let authMsg = "";
            try {
                const secondaryApp = getApps().find(a => a.name === 'SecondaryScreenerCreator') || initializeApp(firebaseConfig, 'SecondaryScreenerCreator');
                const secondaryAuth = getAuth(secondaryApp);
                const cleanEmail = newScreenerEmail.trim().toLowerCase();
                await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, cleanEmail);
                await signOut(secondaryAuth);
                authMsg = `\n✅ Automatically created Firebase login account with password: "${cleanEmail}"`;
            } catch (authErr) {
                if (authErr.code === 'auth/email-already-in-use') {
                    authMsg = `\nℹ️ (Firebase login account already exists for this email address)`;
                } else {
                    console.warn("Auth creation notice:", authErr.message);
                }
            }

            await setDoc(doc(db, "alumni", "screening_data", "screening_assignments", assignId), payload);
            setAssignments(prev => {
                const filtered = prev.filter(item => item.id !== assignId);
                return [...filtered, payload];
            });
            setNewScreenerEmail('');
            setNewScreenerName('');
            setSelectedCountriesForAssign([]);
            setSelectedScreenerToEdit('');
            alert("Assignment saved successfully!" + authMsg);
        } catch (err) {
            console.error("Error saving assignment:", err);
            alert("Failed to save assignment.");
        }
    };

    const handleDeleteAssignment = async (assignItem) => {
        if (!window.confirm(`Are you sure you want to delete the screener assignment for ${assignItem.screenerName || assignItem.screenerEmail}?`)) return;
        try {
            await deleteDoc(doc(db, "alumni", "screening_data", "screening_assignments", assignItem.id));
            setAssignments(prev => prev.filter(item => item.id !== assignItem.id));
            alert(`Screener assignment for ${assignItem.screenerEmail} has been deleted.`);
        } catch (err) {
            console.error("Error deleting screener assignment:", err);
            alert("Failed to delete screener assignment.");
        }
    };

    const handleSaveOverrideScore = async (formData) => {
        if (!selectedApplicant) return;
        setIsSaving(true);
        try {
            const scoreId = `score_${selectedApplicant.id}`;
            const scorePayload = {
                id: scoreId,
                applicantId: selectedApplicant.id,
                screenerId: 'admin_override',
                screenerEmail: 'Admin Override',
                countryOfResidence: selectedApplicant.countryOfResidence || '',
                cohort: selectedApplicant.cohort || selectedApplicant.countryOfResidence || '',
                ...formData,
                updatedAt: new Date().toISOString()
            };

            const scoreCollName = selectedYear === '2026' ? 'screening_scores' : `screening_scores_${selectedYear}`;
            await setDoc(doc(db, "alumni", "screening_data", scoreCollName, scoreId), scorePayload);
            setScores(prev => ({ ...prev, [selectedApplicant.id]: scorePayload }));
            alert("Admin score override saved!");
            setSelectedApplicant(null);
        } catch (err) {
            console.error("Error saving override:", err);
            alert("Failed to save score override.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleExportMasterExcel = () => {
        if (applicants.length === 0) {
            alert("No applicants to export.");
            return;
        }

        const wb = XLSX.utils.book_new();

        // 1. Master Sheet (All Applicants)
        const masterRows = applicants.map(a => {
            const sc = scores[a.id] || {};
            return {
                "Submission Date": a.submissionDate || '',
                "Name": a.name || '',
                "Email": a.email || '',
                "DOB": a.dateOfBirth || '',
                "Gender": a.gender || '',
                "Nationality": a.nationality || '',
                "Country": a.countryOfResidence || '',
                "Province / Cohort": a.cohort || '',
                "Attended AAVC Previously": a.previouslyAttendedAAVC || 'No',
                "Score_Previous AAVC": sc.scorePreviousAAVC !== undefined ? sc.scorePreviousAAVC : (a.autoDisqualified ? -1 : 1),
                "NITAG Member": a.isNITAGMember || 'No',
                "Current Position": a.currentPosition || '',
                "Score_Current position": sc.scoreCurrentPosition !== undefined ? sc.scoreCurrentPosition : '',
                "CV Score": sc.scoreCVe !== undefined ? sc.scoreCVe : '',
                "Motivation Score": sc.scoreMotivationLetter !== undefined ? sc.scoreMotivationLetter : '',
                "HOD Score": sc.scoreHODLetter !== undefined ? sc.scoreHODLetter : '',
                "Completeness Score": sc.scoreCompleteness !== undefined ? sc.scoreCompleteness : '',
                "Total Score": sc.totalScore !== undefined ? sc.totalScore : '',
                "Rank in Cohort": sc.rankInCountry || '',
                "Final Decision": sc.decision || (a.autoDisqualified ? 'Reject' : ''),
                "Comments / Motivation": sc.comments || a.disqualificationReason || '',
                "Auto Disqualified": a.autoDisqualified ? 'YES' : 'NO'
            };
        });

        masterRows.sort((x, y) => {
            if (x["Rank in Cohort"] && y["Rank in Cohort"]) return Number(x["Rank in Cohort"]) - Number(y["Rank in Cohort"]);
            const scoreX = x["Total Score"] !== '' && x["Total Score"] !== undefined ? Number(x["Total Score"]) : (x["Auto Disqualified"] === 'YES' ? -1 : 0);
            const scoreY = y["Total Score"] !== '' && y["Total Score"] !== undefined ? Number(y["Total Score"]) : (y["Auto Disqualified"] === 'YES' ? -1 : 0);
            if (scoreX !== scoreY) return scoreY - scoreX;

            const dwX = getDecisionWeight(x["Final Decision"], x["Auto Disqualified"] === 'YES');
            const dwY = getDecisionWeight(y["Final Decision"], y["Auto Disqualified"] === 'YES');
            if (dwX !== dwY) return dwY - dwX;

            return (x["Name"] || '').localeCompare(y["Name"] || '');
        });

        const masterWs = XLSX.utils.json_to_sheet(masterRows);
        XLSX.utils.book_append_sheet(wb, masterWs, "All Applicants Master");

        // 1.5. Disqualified Sheet
        const dqApplicants = applicants.filter(a => a.autoDisqualified);
        if (dqApplicants.length > 0) {
            const dqRows = dqApplicants.map(a => {
                const sc = scores[a.id] || {};
                return {
                    "Submission Date": a.submissionDate || '',
                    "Name": a.name || '',
                    "Email": a.email || '',
                    "DOB": a.dateOfBirth || '',
                    "Gender": a.gender || '',
                    "Nationality": a.nationality || '',
                    "Country of Residence": a.countryOfResidence || '',
                    "Province / Cohort": a.cohort || '',
                    "Institution": a.institution || '',
                    "Current Position": a.currentPosition || '',
                    "Highest Education": a.highestEducation || '',
                    "Previous Experience": a.previousExperience || '',
                    "Spoken English": a.spokenEnglish || '',
                    "Written English": a.writtenEnglish || '',
                    "Disqualification Reason": a.disqualificationReason || 'Auto-Disqualified',
                    "Previously Attended AAVC": a.previouslyAttendedAAVC || 'No',
                    "Comments / Motivation": sc.comments || a.disqualificationReason || '',
                    "CV URL": a.cvUrl || '',
                    "Motivation Letter URL": a.motivationLetterUrl || '',
                    "Support Letter URL": a.supportLetterUrl || '',
                    "Line Manager Name": a.lineManagerName || '',
                    "Line Manager Email": a.lineManagerEmail || ''
                };
            });
            const dqWs = XLSX.utils.json_to_sheet(dqRows);
            XLSX.utils.book_append_sheet(wb, dqWs, "Disqualified Applicants");
        }

        // 2. Individual Sheet per Cohort/Country
        uniqueCohorts.forEach(cohort => {
            const cohortApps = applicants.filter(a => (a.cohort || a.countryOfResidence) === cohort);
            if (cohortApps.length > 0) {
                const rows = cohortApps
                    .map(a => {
                        const sc = scores[a.id] || {};
                        return {
                            "Rank": sc.rankInCountry || '',
                            "Name": a.name || '',
                            "Email": a.email || '',
                            "Institution": a.institution || '',
                            "Total Score": sc.totalScore !== undefined ? sc.totalScore : (a.autoDisqualified ? 'DQ' : ''),
                            "Decision": sc.decision || (a.autoDisqualified ? 'Reject' : 'Pending'),
                            "Motivation / Comments": sc.comments || a.disqualificationReason || '',
                            "CV Score": sc.scoreCVe !== undefined ? sc.scoreCVe : '',
                            "Motivation Score": sc.scoreMotivationLetter !== undefined ? sc.scoreMotivationLetter : '',
                            "HOD Score": sc.scoreHODLetter !== undefined ? sc.scoreHODLetter : ''
                        };
                    })
                    .sort((x, y) => {
                        if (x["Rank"] && y["Rank"]) return Number(x["Rank"]) - Number(y["Rank"]);
                        const scoreX = x["Total Score"] !== '' && x["Total Score"] !== undefined && x["Total Score"] !== 'DQ' ? Number(x["Total Score"]) : -1;
                        const scoreY = y["Total Score"] !== '' && y["Total Score"] !== undefined && y["Total Score"] !== 'DQ' ? Number(y["Total Score"]) : -1;
                        if (scoreX !== scoreY) return scoreY - scoreX;

                        const dwX = getDecisionWeight(x["Decision"], x["Total Score"] === 'DQ');
                        const dwY = getDecisionWeight(y["Decision"], y["Total Score"] === 'DQ');
                        if (dwX !== dwY) return dwY - dwX;

                        return (x["Name"] || '').localeCompare(y["Name"] || '');
                    });

                const ws = XLSX.utils.json_to_sheet(rows);
                const sheetName = cohort.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
                XLSX.utils.book_append_sheet(wb, ws, sheetName);
            }
        });

        XLSX.writeFile(wb, `AAVC_${selectedYear}_Screening_Master_Report.xlsx`);
    };

    const handleExportDisqualifiedExcel = () => {
        const dqApplicants = applicants.filter(a => a.autoDisqualified);
        if (dqApplicants.length === 0) {
            alert("No disqualified applicants to export.");
            return;
        }

        const rows = dqApplicants.map(a => {
            const sc = scores[a.id] || {};
            return {
                "Submission Date": a.submissionDate || '',
                "Name": a.name || '',
                "Email": a.email || '',
                "DOB": a.dateOfBirth || '',
                "Gender": a.gender || '',
                "Nationality": a.nationality || '',
                "Country of Residence": a.countryOfResidence || '',
                "Province / Cohort": a.cohort || '',
                "Institution": a.institution || '',
                "Current Position": a.currentPosition || '',
                "Highest Education": a.highestEducation || '',
                "Previous Experience": a.previousExperience || '',
                "Spoken English": a.spokenEnglish || '',
                "Written English": a.writtenEnglish || '',
                "Disqualification Reason": a.disqualificationReason || 'Auto-Disqualified',
                "Previously Attended AAVC": a.previouslyAttendedAAVC || 'No',
                "Comments / Motivation": sc.comments || a.disqualificationReason || '',
                "CV URL": a.cvUrl || '',
                "Motivation Letter URL": a.motivationLetterUrl || '',
                "Support Letter URL": a.supportLetterUrl || '',
                "Line Manager Name": a.lineManagerName || '',
                "Line Manager Email": a.lineManagerEmail || ''
            };
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, "Disqualified Applicants");
        XLSX.writeFile(wb, `AAVC_${selectedYear}_Disqualified_Applicants.xlsx`);
    };

    const handleExportAuditReport = () => {
        if (!importAuditReport) return;
        const wb = XLSX.utils.book_new();

        // 1. Duplicates sheet
        if (importAuditReport.duplicates && importAuditReport.duplicates.length > 0) {
            const dupRows = importAuditReport.duplicates.map(d => ({
                "Removed Name": d.name || '',
                "Removed Email": d.email || '',
                "Country": d.country || '',
                "Institution": d.institution || '',
                "Removed Submission Date": d.removedSubmissionDate || '',
                "Kept Submission Date": d.keptSubmissionDate || '',
                "Reason / Details": d.reason || ''
            }));
            const wsDup = XLSX.utils.json_to_sheet(dupRows);
            XLSX.utils.book_append_sheet(wb, wsDup, "Duplicates Removed");
        } else {
            const wsDup = XLSX.utils.json_to_sheet([{ "Status": "No duplicate submissions found during import." }]);
            XLSX.utils.book_append_sheet(wb, wsDup, "Duplicates Removed");
        }

        // 2. Disqualified sheet
        if (importAuditReport.disqualified && importAuditReport.disqualified.length > 0) {
            const dqRows = importAuditReport.disqualified.map(a => ({
                "Applicant Name": a.name || '',
                "Email": a.email || '',
                "Country": a.countryOfResidence || '',
                "Province / Cohort": a.cohort || '',
                "Institution": a.institution || '',
                "Current Position": a.currentPosition || '',
                "Highest Education": a.highestEducation || '',
                "Disqualification Reason": a.disqualificationReason || '',
                "Submission Date": a.submissionDate || ''
            }));
            const wsDq = XLSX.utils.json_to_sheet(dqRows);
            XLSX.utils.book_append_sheet(wb, wsDq, "Disqualified Applicants");
        } else {
            const wsDq = XLSX.utils.json_to_sheet([{ "Status": "No auto-disqualified applicants found during import." }]);
            XLSX.utils.book_append_sheet(wb, wsDq, "Disqualified Applicants");
        }

        // 3. Splits sheet
        if (importAuditReport.splits && importAuditReport.splits.length > 0) {
            const splitRows = importAuditReport.splits.map(s => ({ "Cohort Split Summary": s }));
            const wsSplit = XLSX.utils.json_to_sheet(splitRows);
            XLSX.utils.book_append_sheet(wb, wsSplit, "Cohort Splits");
        }

        XLSX.writeFile(wb, `AAVC_${importAuditReport.year}_Import_Audit_Report.xlsx`);
    };

    const handleImportExcel = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!window.confirm(`Are you sure you want to import applicants from "${file.name}" into AAVC ${selectedYear}?\n\nThis will:\n1. CLEAR all existing applicants for ${selectedYear}\n2. Remove duplicate submissions\n3. Split large countries into cohorts of max 30\n4. Run 5-year auto-disqualification checks`)) {
            e.target.value = null;
            return;
        }
        setImporting(true);
        setImportProgress('Reading Excel spreadsheet...');
        try {
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: 'array' });
            const firstSheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

            // --- Step 0: Clear existing applicants and scores for this year ---
            const targetCollName = `applicants_${selectedYear}`;
            const scoreCollName = selectedYear === '2026' ? 'screening_scores' : `screening_scores_${selectedYear}`;
            const targetNumYear = parseInt(selectedYear, 10) || 2026;
            setImportProgress(`Clearing existing ${selectedYear} applicant and score data...`);
            const existingSnap = await getDocs(collection(db, "alumni", "screening_data", targetCollName));
            const existingScoresSnap = await getDocs(collection(db, "alumni", "screening_data", scoreCollName));
            const deletePromises = [
                ...existingSnap.docs.map(d => deleteDoc(doc(db, "alumni", "screening_data", targetCollName, d.id))),
                ...existingScoresSnap.docs.map(d => deleteDoc(doc(db, "alumni", "screening_data", scoreCollName, d.id)))
            ];
            await Promise.all(deletePromises);
            setImportProgress(`Cleared ${existingSnap.docs.length} records and ${existingScoresSnap.docs.length} scores. Processing ${rows.length} rows...`);

            // Fuzzy property lookup helper that handles exact matches, trimmed keys, and case/space variations
            const getVal = (row, keys) => {
                if (!row) return '';
                for (const k of keys) {
                    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
                        return String(row[k]).trim();
                    }
                }
                const rowKeys = Object.keys(row);
                for (const candidate of keys) {
                    const cleanCandidate = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
                    for (const actualKey of rowKeys) {
                        const cleanActual = actualKey.toLowerCase().replace(/[^a-z0-9]/g, '');
                        if (cleanActual === cleanCandidate || cleanActual.includes(cleanCandidate) || cleanCandidate.includes(cleanActual)) {
                            if (row[actualKey] !== undefined && row[actualKey] !== null && String(row[actualKey]).trim() !== '') {
                                return String(row[actualKey]).trim();
                            }
                        }
                    }
                }
                return '';
            };

            // --- Step 1: Deduplicate rows (keep last submission per email, fallback to name) ---
            const dedupMap = new Map();
            const duplicatesLog = [];
            let totalRawRows = 0;
            for (const r of rows) {
                const rawEmail = getVal(r, ['Email', 'email', 'E-mail']).toLowerCase();
                const rawName = getVal(r, ['Name', 'name', 'Full Name']);
                if (!rawName && !rawEmail) continue;
                totalRawRows++;
                const dedupKey = rawEmail || rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (dedupMap.has(dedupKey)) {
                    const prev = dedupMap.get(dedupKey);
                    duplicatesLog.push({
                        name: rawName || getVal(prev, ['Name', 'name']) || 'Unknown',
                        email: rawEmail || getVal(prev, ['Email', 'email']) || 'No email',
                        country: getVal(r, ['Country of Residence', 'Country']) || getVal(prev, ['Country of Residence', 'Country']),
                        institution: getVal(r, ['Name of Current Institution / Employer:', 'Name of your Institution', 'Institution']) || getVal(prev, ['Name of Current Institution / Employer:', 'Name of your Institution', 'Institution']),
                        removedSubmissionDate: getVal(prev, ['Submission Date', 'submissionDate']) || 'Earlier submission',
                        keptSubmissionDate: getVal(r, ['Submission Date', 'submissionDate']) || 'Latest submission',
                        reason: `Superseded by later submission (${rawEmail || rawName})`
                    });
                }
                dedupMap.set(dedupKey, r); // last submission wins
            }
            const uniqueRows = Array.from(dedupMap.values());
            const duplicatesRemoved = totalRawRows - uniqueRows.length;
            setImportProgress(`Removed ${duplicatesRemoved} duplicate(s). Processing ${uniqueRows.length} unique applicants...`);

            // --- Step 2: Fetch alumni for DQ checks ---
            const alumniSnap = await getDocs(collection(db, "alumni"));
            const alumniList = alumniSnap.docs.map(d => d.data());

            // --- Step 3: Process each unique row (DQ check + country/cohort assignment) ---
            const processedApplicants = [];
            for (const r of uniqueRows) {
                const rawEmail = getVal(r, ['Email', 'email', 'E-mail']).toLowerCase();
                const rawName = getVal(r, ['Name', 'name', 'Full Name']);
                const emailPrefix = rawEmail.split('@')[0] || '';
                const cleanName = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');

                let isDQ = false;
                let dqReason = '';

                // Check 5-year auto DQ against alumni list
                for (const al of alumniList) {
                    const alCourse = String(al.Program || al.program || al.Course || al.course || '').toUpperCase();
                    const alYear = parseInt(al.Year || al.year, 10);
                    if (alCourse === 'AAVC' && !isNaN(alYear) && alYear >= targetNumYear - 5 && alYear <= targetNumYear - 1) {
                        const alEmail = String(al.Email || al.email || '').trim().toLowerCase();
                        const alName = String(al.Name || al.name || `${al.firstName || ''} ${al.surname || al.lastName || ''}`).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                        const alEmailPrefix = alEmail.split('@')[0] || '';

                        if (rawEmail && alEmail && rawEmail === alEmail) {
                            isDQ = true;
                            dqReason = `Exact email match in alumni db for AAVC ${alYear} (${al.Email || al.email})`;
                            break;
                        } else if (cleanName && alName && cleanName.length > 5 && cleanName === alName) {
                            isDQ = true;
                            dqReason = `Exact name match in alumni db for AAVC ${alYear} (${al.Name || alName})`;
                            break;
                        } else if (emailPrefix && alEmailPrefix && emailPrefix.length > 5 && emailPrefix === alEmailPrefix && cleanName && alName && (cleanName.includes(alName) || alName.includes(cleanName))) {
                            isDQ = true;
                            dqReason = `Email prefix & partial name match for AAVC ${alYear}`;
                            break;
                        }
                    }
                }

                // Check self-reported attendance (kept for information purposes only, no longer auto-disqualifies)
                const attendedBefore = getVal(r, [
                    'Have you previously attended the Annual African Vaccinology Course?',
                    'Have you attended the Annual African Vaccinology Course (AAVC) in the past?',
                    'Have you attended the African Vaccinology Course (AVC/AAVC) before?',
                    'Have you attended AAVC before?',
                    'previouslyAttendedAAVC'
                ]).toLowerCase();

                // Determine province/cohort
                const rawCountry = getVal(r, ['Country of Residence', 'Country']);
                const rawProvince = getVal(r, ['If South Africa, indicate which province:', 'Province']).toUpperCase();
                const institutionStr = getVal(r, ['Name of Current Institution / Employer:', 'Name of your Institution', 'Institution', 'institution']).toUpperCase();
                let cohort = rawCountry || 'Unknown';

                if (rawCountry.toLowerCase().includes('south africa')) {
                    if (rawProvince.includes('WESTERN') || rawProvince === 'WC' || institutionStr.includes('STELLENBOSCH') || institutionStr.includes('CAPE TOWN') || institutionStr.includes('UCT')) {
                        cohort = 'SA-WC';
                    } else if (rawProvince.includes('GAUTENG') || rawProvince === 'GP' || institutionStr.includes('WITWATERSRAND') || institutionStr.includes('WITS') || institutionStr.includes('PRETORIA')) {
                        cohort = 'SA-GP';
                    } else if (rawProvince.includes('KWAZULU') || rawProvince.includes('NATAL') || rawProvince === 'KZN' || institutionStr.includes('KWAZULU-NATAL') || institutionStr.includes('UKZN')) {
                        cohort = 'SA-KZN';
                    } else if (rawProvince.includes('LIMPOPO') || rawProvince === 'LP' || institutionStr.includes('LIMPOPO')) {
                        cohort = 'SA-LP';
                    } else if (rawProvince.includes('FREE STATE') || rawProvince === 'FS' || institutionStr.includes('FREE STATE')) {
                        cohort = 'SA-FS';
                    } else if (rawProvince.includes('EASTERN CAPE') || rawProvince === 'EC' || institutionStr.includes('WALTER SISULU') || institutionStr.includes('FORT HARE') || institutionStr.includes('RHODES')) {
                        cohort = 'SA-EC';
                    } else if (rawProvince.includes('MPUMALANGA') || rawProvince === 'MP') {
                        cohort = 'SA-MP';
                    } else if (rawProvince.includes('NORTH WEST') || rawProvince === 'NW') {
                        cohort = 'SA-NW';
                    } else if (rawProvince.includes('NORTHERN CAPE') || rawProvince === 'NC') {
                        cohort = 'SA-NC';
                    } else {
                        cohort = 'SA-GP';
                    }
                }

                const docId = rawEmail ? rawEmail.replace(/[^a-z0-9]/g, '_') : `app_${Date.now()}_${processedApplicants.length}`;
                processedApplicants.push({
                    id: docId,
                    name: rawName,
                    email: rawEmail,
                    dateOfBirth: getVal(r, ['Date of Birth', 'DOB', 'dateOfBirth']),
                    gender: getVal(r, ['Gender', 'gender']),
                    nationality: getVal(r, ['Nationality', 'nationality']),
                    countryOfResidence: rawCountry,
                    cohort: cohort, // preliminary — will be updated by cohort splitting
                    province: rawProvince,
                    mobilePhone: getVal(r, ['Mobile Telephone Number', 'Mobile Phone Number', 'Mobile', 'mobilePhone']),
                    officePhone: getVal(r, ['Office Telephone Number', 'Office Phone', 'officePhone']),
                    institution: getVal(r, ['Name of Current Institution / Employer:', 'Name of your Institution', 'Institution', 'institution']),
                    institutionAddress: getVal(r, ['Address of current Institution / Employer:', 'Address', 'institutionAddress']),
                    currentPosition: getVal(r, ['Current Employment Position', 'Current Position', 'currentPosition']),
                    highestEducation: getVal(r, ['Highest level of education', 'Highest Education', 'highestEducation']),
                    previousExperience: getVal(r, ['Previous Relevant work experience in vaccinology', 'Previous Experience in Vaccinology', 'previousExperience']),
                    spokenEnglish: getVal(r, ['Proficiency of your spoken English', 'Spoken English', 'spokenEnglish']),
                    writtenEnglish: getVal(r, ['Proficiency of your written English', 'Written English', 'writtenEnglish']),
                    previouslyAttendedAAVC: getVal(r, ['Have you previously attended the Annual African Vaccinology Course?', 'Have you attended the Annual African Vaccinology Course (AAVC) in the past?', 'Have you attended the African Vaccinology Course (AVC/AAVC) before?', 'Have you attended AAVC before?', 'previouslyAttendedAAVC']) || 'No',
                    attendanceYear: getVal(r, ['Which year attended', 'attendanceYear']),
                    isNITAGMember: getVal(r, ['Have you been appointed by your Minister of Health to serve on your National Immunization Technical Advisory Group?', 'NITAG Member', 'isNITAGMember']) || 'No',
                    nitagRole: getVal(r, ['NITAG Role', 'nitagRole']),
                    attendedOtherCourse: getVal(r, ['Have you attended any OTHER vaccinology course in the past?', 'attendedOtherCourse']) || 'No',
                    otherCourseDetail: getVal(r, ['If yes to the question above, specify the course attended and which year.', 'otherCourseDetail']),
                    cvUrl: getVal(r, ['Abridged Curriculum Vitae (CV) - MAX 2 PAGES', 'cvUrl']),
                    motivationLetterUrl: getVal(r, ['Motivation Letter - MAX 1 PAGE', 'motivationLetterUrl']),
                    supportLetterUrl: getVal(r, ['Support Letter from your supervisor / Line Manager - MAX 1 PAGE', 'supportLetterUrl']),
                    lineManagerTitle: getVal(r, ['Title of Line Manager', 'lineManagerTitle']),
                    lineManagerName: getVal(r, ['Name of Line Manager', 'Name of your Line Manager / Supervisor', 'lineManagerName']),
                    lineManagerEmail: getVal(r, ['Email of Line Manager', 'Email address of your Line Manager / Supervisor', 'lineManagerEmail']),
                    lineManagerOfficePhone: getVal(r, ["Line Manager's Office Telephone Number", 'Office Phone Number', 'lineManagerOfficePhone']),
                    lineManagerMobilePhone: getVal(r, ["Line Manager's Mobile Telephone Number", 'Mobile Phone Number', 'lineManagerMobilePhone']),
                    passportNumber: getVal(r, ['Passport Number / Identification Number', 'passportNumber']),
                    submissionDate: getVal(r, ['Submission Date', 'submissionDate']),
                    autoDisqualified: isDQ,
                    disqualificationReason: dqReason,
                    importedAt: new Date().toISOString()
                });
            }

            // --- Step 4: Cohort splitting (>40 → random chunks of max 30, skip SA- provinces) ---
            setImportProgress('Splitting large cohorts into groups of max 30...');
            const cohortGroups = {};
            for (const app of processedApplicants) {
                if (!cohortGroups[app.cohort]) cohortGroups[app.cohort] = [];
                cohortGroups[app.cohort].push(app);
            }

            // Fisher-Yates shuffle helper
            const shuffle = (arr) => {
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                }
                return arr;
            };

            const cohortSplitSummary = [];
            for (const [cohortName, members] of Object.entries(cohortGroups)) {
                // Skip SA provinces from splitting — they stay as-is
                if (cohortName.startsWith('SA-')) continue;
                if (members.length > 40) {
                    shuffle(members);
                    const chunkSize = 30;
                    const numChunks = Math.ceil(members.length / chunkSize);
                    for (let i = 0; i < numChunks; i++) {
                        const chunkMembers = members.slice(i * chunkSize, (i + 1) * chunkSize);
                        const newCohortLabel = `${cohortName} Cohort ${i + 1}`;
                        for (const app of chunkMembers) {
                            app.cohort = newCohortLabel;
                        }
                    }
                    cohortSplitSummary.push(`${cohortName}: ${members.length} → ${numChunks} cohorts`);
                }
            }

            // --- Step 5: Write all to Firestore ---
            let count = 0;
            let dqCount = 0;
            for (const payload of processedApplicants) {
                await setDoc(doc(db, "alumni", "screening_data", targetCollName, payload.id), payload);
                count++;
                if (payload.autoDisqualified) dqCount++;
                if (count % 15 === 0) {
                    setImportProgress(`Writing ${count} of ${processedApplicants.length} to database...`);
                }
            }

            const disqualifiedLog = processedApplicants.filter(a => a.autoDisqualified);
            const auditData = {
                year: selectedYear,
                totalRows: totalRawRows,
                uniqueCount: count,
                duplicates: duplicatesLog,
                disqualified: disqualifiedLog,
                splits: cohortSplitSummary,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                isOpen: true
            };
            setImportAuditReport(auditData);
            setActiveAuditTab(duplicatesLog.length > 0 ? 'duplicates' : (disqualifiedLog.length > 0 ? 'disqualified' : 'splits'));

            const splitInfo = cohortSplitSummary.length > 0 ? `\n\nCohort Splits:\n${cohortSplitSummary.join('\n')}` : '';
            alert(`Successfully imported ${count} unique applicants into AAVC ${selectedYear}!\nDuplicates removed: ${duplicatesRemoved}\nAuto-Disqualified: ${dqCount}${splitInfo}\n\nOpening detailed double-check report modal now...`);
            fetchData();
        } catch (err) {
            console.error("Excel import error:", err);
            alert("Error importing Excel file: " + err.message);
        } finally {
            setImporting(false);
            setImportProgress('');
            if (e.target) e.target.value = null;
        }
    };

    const filteredApplicants = applicants.filter(a => {
        const cohortMatch = selectedCohort === 'All' ? true : (a.cohort || a.countryOfResidence) === selectedCohort;
        const sc = scores[a.id];
        const status = a.autoDisqualified ? 'Disqualified' : (sc ? 'Scored' : 'Pending');
        const statusMatch = statusFilter === 'All' ? true : status === statusFilter;
        const searchMatch = searchTerm ? (
            a.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.cohort?.toLowerCase().includes(searchTerm.toLowerCase())
        ) : true;

        return cohortMatch && statusMatch && searchMatch;
    }).sort((x, y) => compareScoreAndDecision(x, y, scores[x.id], scores[y.id]));

    const totalScored = applicants.filter(a => scores[a.id] && scores[a.id].totalScore !== undefined).length;
    const totalDQ = applicants.filter(a => a.autoDisqualified).length;

    const userAssignedCohorts = assignments.find(a => a.screenerEmail?.toLowerCase() === currentUser?.email?.toLowerCase())?.assignedCountries || [];
    const isAdmin = isUserAdmin(currentUser?.email, userAssignedCohorts);

    if (loading) {
        return <div className="admin-loading">Loading screening administration panel...</div>;
    }

    if (!isAdmin) {
        return (
            <div className="screening-admin-container" style={{ padding: '40px', textAlign: 'center' }}>
                <div className="alumni-form-card" style={{ maxWidth: '600px', margin: '0 auto', padding: '30px' }}>
                    <h3 style={{ color: '#d32f2f' }}>🔒 Access Denied: Administrator Permissions Required</h3>
                    <p style={{ marginTop: '15px', fontSize: '16px', lineHeight: '1.5' }}>
                        Hello <strong>{currentUser?.email}</strong>,<br /><br />
                        You do not have administrative privileges to access the Screening Administration Portal.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="screening-admin-container">
            <div className="admin-header">
                <div>
                    <h2>Screening Administration Portal</h2>
                    <p>Assign cohorts to screeners, monitor screening progress, override scores, and generate master exports.</p>
                </div>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="cohort-selector-box" style={{ margin: 0 }}>
                        <label>Screening Year:</label>
                        <select 
                            value={selectedYear} 
                            onChange={(e) => {
                                setSelectedYear(e.target.value);
                                setSelectedApplicant(null);
                                setSelectedCohort('All');
                            }}
                            className="cohort-select"
                            style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}
                        >
                            <option value="2026">AAVC 2026</option>
                            <option value="2027">AAVC 2027</option>
                            <option value="2028">AAVC 2028</option>
                            <option value="2029">AAVC 2029</option>
                            <option value="2030">AAVC 2030</option>
                        </select>
                    </div>

                    <label className="btn-master-export" style={{ background: '#2E7D32', cursor: importing ? 'wait' : 'pointer', margin: 0 }}>
                        {importing ? '⏳ Importing...' : `📥 Import Jotform Excel for ${selectedYear}`}
                        <input 
                            type="file" 
                            accept=".xlsx,.xls" 
                            onChange={handleImportExcel} 
                            disabled={importing}
                            style={{ display: 'none' }} 
                        />
                    </label>

                    <button onClick={handleExportMasterExcel} className="btn-master-export" disabled={importing}>
                        📊 Export Master Excel
                    </button>

                    <button onClick={handleExportDisqualifiedExcel} className="btn-master-export" style={{ background: '#c53030' }} disabled={importing}>
                        🚫 Export Disqualified ({applicants.filter(a => a.autoDisqualified).length})
                    </button>

                    {importAuditReport && (
                        <button 
                            onClick={() => setImportAuditReport(prev => ({ ...prev, isOpen: true }))} 
                            className="btn-master-export" 
                            style={{ background: '#0284c7' }}
                            disabled={importing}
                        >
                            📋 View Import Audit Report
                        </button>
                    )}
                </div>
            </div>

            {importProgress && (
                <div style={{ background: '#E8F5E9', color: '#2E7D32', padding: '12px 20px', borderRadius: '8px', marginBottom: '20px', fontWeight: 'bold' }}>
                    ⏳ {importProgress}
                </div>
            )}

            {/* Overview Stats */}
            <div className="stats-cards-row">
                <div className="stat-card">
                    <span className="stat-label">Total Applicants</span>
                    <strong className="stat-num">{applicants.length}</strong>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Total Scored by Screeners</span>
                    <strong className="stat-num text-success">{totalScored}</strong>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Auto-Disqualified (DB/Attendance)</span>
                    <strong className="stat-num text-danger">{totalDQ}</strong>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Total Cohorts / Provinces</span>
                    <strong className="stat-num">{uniqueCohorts.length}</strong>
                </div>
            </div>

            {/* Screener Assignment Section */}
            <div className="admin-section-box">
                <h3>👥 Screener Cohort Assignments</h3>
                <p className="sub-description">
                    When screeners log in with their email, they automatically see and screen the cohorts/provinces assigned below.
                </p>

                <div className="assignments-grid">
                    {/* Form to add/update screener */}
                    <form className="assignment-form" onSubmit={handleSaveAssignment}>
                        <h4>Assign or Update Screener</h4>
                        <div className="form-row" style={{ flexDirection: 'column', gap: '12px' }}>
                            <select 
                                className="assign-input"
                                value={selectedScreenerToEdit}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setSelectedScreenerToEdit(val);
                                    if (val === '__NEW__') {
                                        setNewScreenerEmail('');
                                        setNewScreenerName('');
                                        setSelectedCountriesForAssign([]);
                                    } else if (val) {
                                        const found = assignments.find(a => a.id === val || a.screenerEmail === val);
                                        if (found) {
                                            setNewScreenerEmail(found.screenerEmail || '');
                                            setNewScreenerName(found.screenerName || '');
                                            setSelectedCountriesForAssign(found.assignedCountries || []);
                                        }
                                    } else {
                                        setNewScreenerEmail('');
                                        setNewScreenerName('');
                                        setSelectedCountriesForAssign([]);
                                    }
                                }}
                                style={{ fontWeight: 'bold', fontSize: '15px', padding: '10px' }}
                            >
                                <option value="">-- Select Screener to Assign Cohorts --</option>
                                {assignments.map(a => (
                                    <option key={a.id || a.screenerEmail} value={a.id || a.screenerEmail}>
                                        {a.screenerName ? `${a.screenerName} (${a.screenerEmail})` : a.screenerEmail}
                                    </option>
                                ))}
                                <option value="__NEW__">➕ Add New Screener (Type Email manually)</option>
                            </select>

                            {selectedScreenerToEdit === '__NEW__' && (
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                    <input 
                                        type="email" 
                                        placeholder="Screener Email (e.g. screener@vacfa.org)"
                                        value={newScreenerEmail}
                                        onChange={(e) => setNewScreenerEmail(e.target.value)}
                                        required
                                        className="assign-input"
                                        style={{ flex: 1 }}
                                    />
                                    <input 
                                        type="text" 
                                        placeholder="Screener Name (Optional)"
                                        value={newScreenerName}
                                        onChange={(e) => setNewScreenerName(e.target.value)}
                                        className="assign-input"
                                        style={{ flex: 1 }}
                                    />
                                </div>
                            )}
                        </div>

                        <label className="select-countries-label">Select Assigned Cohorts / Provinces:</label>
                        <div className="countries-checkbox-grid">
                            {uniqueCohorts.map(c => {
                                // Find which screeners already have this cohort assigned
                                const alreadyAssignedTo = assignments
                                    .filter(a => a.assignedCountries?.includes(c))
                                    .map(a => a.screenerName || a.screenerEmail);
                                
                                const isAlreadyAssigned = alreadyAssignedTo.length > 0;
                                const isSelected = selectedCountriesForAssign.includes(c);

                                return (
                                    <label 
                                        key={c} 
                                        className={`country-checkbox-item ${isSelected ? 'active' : ''}`}
                                        style={isAlreadyAssigned && !isSelected ? { background: '#f0fdf4', border: '1px solid #4ade80' } : {}}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={isSelected}
                                                onChange={() => handleToggleCountryForAssign(c)}
                                            />
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span>{c}</span>
                                                {isAlreadyAssigned && (
                                                    <span style={{ fontSize: '11px', color: '#166534', marginTop: '2px', fontWeight: '500' }}>
                                                        Assigned to: {alreadyAssignedTo.join(', ')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>

                        <button type="submit" className="btn-save-assignment">
                            Save Screener Assignment
                        </button>
                    </form>

                    {/* Current assignments list */}
                    <div className="assignments-list-card">
                        <h4>Current Active Assignments ({assignments.length})</h4>
                        {assignments.length > 0 ? (
                            <div className="assignments-scroll-list">
                                {assignments.map(a => (
                                    <div key={a.id} className="assignment-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                        <div>
                                            <div className="assign-item-header">
                                                <strong>{a.screenerName}</strong>
                                                <span className="assign-email">{a.screenerEmail}</span>
                                            </div>
                                            <div style={{ fontSize: '13px', color: '#0f172a', fontWeight: '600', marginBottom: '6px' }}>
                                                Total Workload: <span style={{ color: '#2563eb' }}>{applicants.filter(app => (a.assignedCountries || []).includes(app.cohort || app.countryOfResidence)).length}</span> Applicants
                                            </div>
                                            <div className="assign-badges">
                                                {(a.assignedCountries || []).map(c => (
                                                    <span key={c} className="assign-cohort-badge">{c}</span>
                                                ))}
                                                {(a.assignedCountries || []).length === 0 && <span className="text-muted">No countries assigned yet</span>}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <button 
                                                type="button" 
                                                onClick={() => handleDeleteAssignment(a)}
                                                style={{ background: '#dc3545', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
                                                title="Delete screener assignment"
                                            >
                                                🗑️ Delete
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted">No screener assignments configured yet.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Master Results Table & Override Panel */}
            <div className="admin-section-box">
                <h3>📋 Master Applicants Directory & Score Overrides</h3>
                <div className="admin-filters-bar">
                    <input 
                        type="text" 
                        placeholder="Search applicant name, email, cohort..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="admin-search-input"
                    />
                    <select 
                        value={selectedCohort} 
                        onChange={(e) => setSelectedCohort(e.target.value)}
                        className="admin-select"
                    >
                        <option value="All">All Cohorts / Provinces ({uniqueCohorts.length})</option>
                        {uniqueCohorts.map(c => (
                            <option key={c} value={c}>{c} ({applicants.filter(a => (a.cohort || a.countryOfResidence) === c).length})</option>
                        ))}
                    </select>
                    <select 
                        value={statusFilter} 
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="admin-select"
                    >
                        <option value="All">Status: All</option>
                        <option value="Pending">Pending</option>
                        <option value="Scored">Scored</option>
                        <option value="Disqualified">Disqualified</option>
                    </select>
                </div>

                {selectedApplicant && (
                    <div className="admin-override-modal">
                        <div className="override-modal-content">
                            <div className="modal-top">
                                <h3>Score Override — {selectedApplicant.name} ({selectedApplicant.cohort})</h3>
                                <button onClick={() => setSelectedApplicant(null)} className="btn-close-modal">✕</button>
                            </div>
                            <ScoringForm 
                                applicant={selectedApplicant}
                                existingScore={scores[selectedApplicant.id]}
                                onSave={handleSaveOverrideScore}
                                onCancel={() => setSelectedApplicant(null)}
                                isSaving={isSaving}
                            />
                        </div>
                    </div>
                )}

                <div className="master-table-wrapper">
                    <table className="master-table">
                        <thead>
                            <tr>
                                <th>Applicant Name</th>
                                <th>Cohort / Province</th>
                                <th>Institution</th>
                                <th>Status</th>
                                <th>Total Score</th>
                                <th>Rank</th>
                                <th>Decision</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredApplicants.slice(0, 200).map(app => {
                                const sc = scores[app.id] || {};
                                const isDQ = app.autoDisqualified;
                                const total = sc.totalScore !== undefined ? sc.totalScore : (isDQ ? 'DQ' : '-');
                                return (
                                    <tr key={app.id} className={isDQ ? 'row-dq' : ''}>
                                        <td className="font-bold">
                                            {app.name}
                                            <div className="sub-email">{app.email}</div>
                                        </td>
                                        <td><strong>{app.cohort || app.countryOfResidence}</strong></td>
                                        <td>{app.institution || 'N/A'}</td>
                                        <td>
                                            <span className={`status-badge ${isDQ ? 'badge-disqualified' : (sc.totalScore !== undefined ? 'badge-scored' : 'badge-pending')}`}>
                                                {isDQ ? 'Disqualified' : (sc.totalScore !== undefined ? 'Scored' : 'Pending')}
                                            </span>
                                        </td>
                                        <td className="text-center font-bold text-primary">{total}</td>
                                        <td className="text-center">{sc.rankInCountry || '-'}</td>
                                        <td>
                                            <span className={`decision-tag decision-${(sc.decision || (isDQ ? 'Reject' : 'Pending')).toLowerCase()}`}>
                                                {sc.decision || (isDQ ? 'Reject' : 'Pending')}
                                            </span>
                                        </td>
                                        <td>
                                            <button 
                                                onClick={() => setSelectedApplicant(app)} 
                                                className="btn-admin-edit"
                                            >
                                                Override / Score
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filteredApplicants.length > 200 && (
                        <p className="table-limit-notice">Showing first 200 matches out of {filteredApplicants.length}. Use filters or search to narrow down.</p>
                    )}
                </div>
            </div>

            {/* Import Audit Report Modal */}
            {importAuditReport && importAuditReport.isOpen !== false && (
                <div className="admin-override-modal">
                    <div className="override-modal-content" style={{ maxWidth: '1100px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '24px' }}>
                        <div className="modal-top" style={{ flexShrink: 0, borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.4rem', color: '#0f172a' }}>📋 AAVC {importAuditReport.year} Import Audit & Double-Check Report</h3>
                                <p style={{ margin: '6px 0 0 0', fontSize: '0.9rem', color: '#64748b' }}>
                                    Imported at {importAuditReport.timestamp} • Total Raw Spreadsheet Rows: <strong>{importAuditReport.totalRows}</strong> • Unique Applicants Saved: <strong>{importAuditReport.uniqueCount}</strong>
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <button onClick={handleExportAuditReport} className="btn-master-export" style={{ background: '#2E7D32', margin: 0, padding: '8px 16px', fontSize: '0.9rem', borderRadius: '8px' }}>
                                    📥 Download Audit Excel
                                </button>
                                <button onClick={() => setImportAuditReport(prev => ({ ...prev, isOpen: false }))} className="btn-close-modal" title="Close" style={{ fontSize: '1.8rem', padding: '0 8px' }}>×</button>
                            </div>
                        </div>

                        {/* Summary Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', margin: '20px 0', flexShrink: 0 }}>
                            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700, letterSpacing: '0.5px' }}>DUPLICATES REMOVED</div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#d97706', marginTop: '6px' }}>{importAuditReport.duplicates?.length || 0}</div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700, letterSpacing: '0.5px' }}>AUTO-DISQUALIFIED</div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#dc2626', marginTop: '6px' }}>{importAuditReport.disqualified?.length || 0}</div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700, letterSpacing: '0.5px' }}>COHORT SPLITS (&gt;40)</div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#2563eb', marginTop: '6px' }}>{importAuditReport.splits?.length || 0}</div>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', marginBottom: '16px', flexShrink: 0 }}>
                            <button 
                                onClick={() => setActiveAuditTab('duplicates')} 
                                style={{ padding: '10px 18px', border: 'none', background: activeAuditTab === 'duplicates' ? '#f59e0b' : 'transparent', color: activeAuditTab === 'duplicates' ? '#fff' : '#475569', fontWeight: 700, borderRadius: '8px 8px 0 0', cursor: 'pointer', transition: 'all 0.2s' }}
                            >
                                🗑️ Duplicates Removed ({importAuditReport.duplicates?.length || 0})
                            </button>
                            <button 
                                onClick={() => setActiveAuditTab('disqualified')} 
                                style={{ padding: '10px 18px', border: 'none', background: activeAuditTab === 'disqualified' ? '#ef4444' : 'transparent', color: activeAuditTab === 'disqualified' ? '#fff' : '#475569', fontWeight: 700, borderRadius: '8px 8px 0 0', cursor: 'pointer', transition: 'all 0.2s' }}
                            >
                                🚫 Auto-Disqualified ({importAuditReport.disqualified?.length || 0})
                            </button>
                            <button 
                                onClick={() => setActiveAuditTab('splits')} 
                                style={{ padding: '10px 18px', border: 'none', background: activeAuditTab === 'splits' ? '#3b82f6' : 'transparent', color: activeAuditTab === 'splits' ? '#fff' : '#475569', fontWeight: 700, borderRadius: '8px 8px 0 0', cursor: 'pointer', transition: 'all 0.2s' }}
                            >
                                🔀 Cohort Splits ({importAuditReport.splits?.length || 0})
                            </button>
                        </div>

                        {/* Tab Content */}
                        <div style={{ overflowY: 'auto', flexGrow: 1, border: '1px solid #f1f5f9', borderRadius: '8px' }}>
                            {activeAuditTab === 'duplicates' && (
                                importAuditReport.duplicates?.length > 0 ? (
                                    <table className="cohorts-table" style={{ width: '100%', fontSize: '0.88rem', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc' }}>
                                                <th style={{ padding: '12px' }}>Removed Name & Email</th>
                                                <th style={{ padding: '12px' }}>Country & Institution</th>
                                                <th style={{ padding: '12px' }}>Removed Submission Date</th>
                                                <th style={{ padding: '12px' }}>Kept Submission Date (Latest)</th>
                                                <th style={{ padding: '12px' }}>Details</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {importAuditReport.duplicates.map((d, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                    <td style={{ padding: '12px' }}>
                                                        <strong style={{ color: '#0f172a' }}>{d.name}</strong><br />
                                                        <span style={{ color: '#64748b' }}>{d.email}</span>
                                                    </td>
                                                    <td style={{ padding: '12px' }}>
                                                        <strong>{d.country || 'N/A'}</strong><br />
                                                        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{d.institution}</span>
                                                    </td>
                                                    <td style={{ padding: '12px', color: '#dc2626', fontWeight: 500 }}>{d.removedSubmissionDate}</td>
                                                    <td style={{ padding: '12px', color: '#16a34a', fontWeight: 700 }}>{d.keptSubmissionDate}</td>
                                                    <td style={{ padding: '12px', fontSize: '0.82rem', color: '#475569' }}>{d.reason}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '1rem' }}>No duplicate submissions found during this import.</div>
                                )
                            )}

                            {activeAuditTab === 'disqualified' && (
                                importAuditReport.disqualified?.length > 0 ? (
                                    <table className="cohorts-table" style={{ width: '100%', fontSize: '0.88rem', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc' }}>
                                                <th style={{ padding: '12px' }}>Applicant Name & Email</th>
                                                <th style={{ padding: '12px' }}>Country / Province</th>
                                                <th style={{ padding: '12px' }}>Institution</th>
                                                <th style={{ padding: '12px' }}>Disqualification Reason</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {importAuditReport.disqualified.map((a, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                    <td style={{ padding: '12px' }}>
                                                        <strong style={{ color: '#0f172a' }}>{a.name}</strong><br />
                                                        <span style={{ color: '#64748b' }}>{a.email}</span>
                                                    </td>
                                                    <td style={{ padding: '12px', fontWeight: 600 }}>{a.cohort || a.countryOfResidence}</td>
                                                    <td style={{ padding: '12px' }}>{a.institution}</td>
                                                    <td style={{ padding: '12px', color: '#dc2626', fontWeight: 700 }}>{a.disqualificationReason}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '1rem' }}>No auto-disqualified applicants found during this import.</div>
                                )
                            )}

                            {activeAuditTab === 'splits' && (
                                importAuditReport.splits?.length > 0 ? (
                                    <div style={{ padding: '20px' }}>
                                        <ul style={{ lineHeight: '2', fontSize: '1rem', color: '#1e293b' }}>
                                            {importAuditReport.splits.map((s, idx) => (
                                                <li key={idx}><strong>{s}</strong></li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : (
                                    <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '1rem' }}>No countries exceeded 40 applicants (no cohort splitting occurred).</div>
                                )
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
                            <button onClick={() => setImportAuditReport(prev => ({ ...prev, isOpen: false }))} className="btn-save-screener" style={{ background: '#64748b', margin: 0, padding: '10px 24px', borderRadius: '8px' }}>
                                Close Audit Report
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScreeningAdmin;
