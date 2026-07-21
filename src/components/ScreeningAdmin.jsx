import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, firebaseConfig } from '../firebaseConfig';
import { useAuth } from '../contexts/AuthContext';
import { isUserAdmin } from '../config/admins';
import ScoringForm from './ScoringForm';
import * as XLSX from 'xlsx';
import './ScreeningAdmin.css';

const ScreeningAdmin = () => {
    const { currentUser } = useAuth();
    const [selectedYear, setSelectedYear] = useState('2026');
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState('');

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
                        if (x["Rank"] && y["Rank"]) return x["Rank"] - y["Rank"];
                        return (Number(y["Total Score"]) || 0) - (Number(x["Total Score"]) || 0);
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

            // --- Step 1: Deduplicate rows (keep last submission per email, fallback to name) ---
            const dedupMap = new Map();
            let totalRawRows = 0;
            for (const r of rows) {
                const rawEmail = String(r['Email'] || r['email'] || r['E-mail'] || '').trim().toLowerCase();
                const rawName = String(r['Name'] || r['name'] || r['Full Name'] || '').trim();
                if (!rawName && !rawEmail) continue;
                totalRawRows++;
                const dedupKey = rawEmail || rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
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
                const rawEmail = String(r['Email'] || r['email'] || r['E-mail'] || '').trim().toLowerCase();
                const rawName = String(r['Name'] || r['name'] || r['Full Name'] || '').trim();
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

                // Check self-reported attendance
                const attendedBefore = String(
                    r['Have you attended the African Vaccinology Course (AVC/AAVC) before?'] ||
                    r['Have you attended AAVC before?'] || ''
                ).trim().toLowerCase();
                if (!isDQ && (attendedBefore === 'yes' || attendedBefore.startsWith('y'))) {
                    isDQ = true;
                    dqReason = `Applicant self-reported attending AAVC previously (${attendedBefore})`;
                }

                // Determine province/cohort
                const rawCountry = String(r['Country of Residence'] || r['Country'] || '').trim();
                const rawProvince = String(r['If South Africa, indicate which province:'] || r['Province'] || '').trim().toUpperCase();
                const institutionStr = String(r['Name of your Institution'] || r['Institution'] || '').trim().toUpperCase();
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
                    gender: String(r['Gender'] || ''),
                    countryOfResidence: rawCountry,
                    cohort: cohort, // preliminary — will be updated by cohort splitting
                    province: rawProvince,
                    institution: String(r['Name of your Institution'] || r['Institution'] || ''),
                    currentPosition: String(r['Current Position'] || ''),
                    highestEducation: String(r['Highest Education'] || ''),
                    previousExperience: String(r['Previous Experience in Vaccinology'] || ''),
                    spokenEnglish: String(r['Spoken English'] || ''),
                    writtenEnglish: String(r['Written English'] || ''),
                    cvUrl: String(r['Abridged Curriculum Vitae (CV) - MAX 2 PAGES'] || r['cvUrl'] || ''),
                    motivationLetterUrl: String(r['Motivation Letter - MAX 1 PAGE'] || r['motivationLetterUrl'] || ''),
                    supportLetterUrl: String(r['Support Letter from your supervisor / Line Manager - MAX 1 PAGE'] || r['supportLetterUrl'] || ''),
                    lineManagerName: String(r['Name of your Line Manager / Supervisor'] || ''),
                    lineManagerEmail: String(r['Email address of your Line Manager / Supervisor'] || ''),
                    lineManagerOfficePhone: String(r['Office Phone Number'] || ''),
                    lineManagerMobilePhone: String(r['Mobile Phone Number'] || ''),
                    previouslyAttendedAAVC: attendedBefore,
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

            const splitInfo = cohortSplitSummary.length > 0 ? `\n\nCohort Splits:\n${cohortSplitSummary.join('\n')}` : '';
            alert(`Successfully imported ${count} unique applicants into AAVC ${selectedYear}!\nDuplicates removed: ${duplicatesRemoved}\nAuto-Disqualified: ${dqCount}${splitInfo}`);
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
    });

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
                            {uniqueCohorts.map(c => (
                                <label key={c} className={`country-checkbox-item ${selectedCountriesForAssign.includes(c) ? 'active' : ''}`}>
                                    <input 
                                        type="checkbox" 
                                        checked={selectedCountriesForAssign.includes(c)}
                                        onChange={() => handleToggleCountryForAssign(c)}
                                    />
                                    <span>{c}</span>
                                </label>
                            ))}
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
                                    <div key={a.id} className="assignment-item">
                                        <div className="assign-item-header">
                                            <strong>{a.screenerName}</strong>
                                            <span className="assign-email">{a.screenerEmail}</span>
                                        </div>
                                        <div className="assign-badges">
                                            {(a.assignedCountries || []).map(c => (
                                                <span key={c} className="assign-cohort-badge">{c}</span>
                                            ))}
                                            {(a.assignedCountries || []).length === 0 && <span className="text-muted">No countries assigned yet</span>}
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
        </div>
    );
};

export default ScreeningAdmin;
