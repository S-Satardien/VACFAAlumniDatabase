import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, setDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../contexts/AuthContext';
import { isUserAdmin } from '../config/admins';
import ApplicantCard from './ApplicantCard';
import ScoringForm from './ScoringForm';
import * as XLSX from 'xlsx';
import './ScreeningWorkspace.css';

const JOTFORM_API_KEY = "cc1659334334a0b6e3dc064810034a89";

/** Google Drive embed URL for the screening video walkthrough. */
const GUIDE_VIDEO_EMBED_URL = "https://drive.google.com/file/d/18Mt_JIbNk-k9JgXeEo4D-g7GbldmdD1Q/preview";

const getDocUrl = (url) => {
    if (!url) return '';
    const cleanUrl = String(url).trim();
    if (!cleanUrl.toLowerCase().includes('jotform.com')) return cleanUrl;
    const separator = cleanUrl.includes('?') ? '&' : '?';
    return `${cleanUrl}${separator}apiKey=${JOTFORM_API_KEY}`;
};

const getGoogleViewerUrl = (url) => {
    if (!url) return '';
    const fullUrl = getDocUrl(url);
    return `https://docs.google.com/viewer?url=${encodeURIComponent(fullUrl)}`;
};

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

const ScreeningWorkspace = () => {
    const { currentUser } = useAuth();
    const [selectedYear, setSelectedYear] = useState('2026');
    const [applicants, setApplicants] = useState([]);
    const [scores, setScores] = useState({});
    const [assignedCohorts, setAssignedCohorts] = useState([]);
    const [uniqueCohorts, setUniqueCohorts] = useState([]);
    const [selectedCohort, setSelectedCohort] = useState('');
    const [selectedApplicant, setSelectedApplicant] = useState(null);
    const [statusFilter, setStatusFilter] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('review'); // 'review' | 'ranking'
    const [showVideoModal, setShowVideoModal] = useState(false);

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

            // 3. Fetch Screener Assignment
            let userCohorts = [];
            if (currentUser) {
                const assignSnap = await getDocs(collection(db, "alumni", "screening_data", "screening_assignments"));
                assignSnap.docs.forEach(d => {
                    const data = d.data();
                    if (data.visitorId === currentUser.uid || data.screenerEmail?.toLowerCase() === currentUser.email?.toLowerCase()) {
                        userCohorts = data.assignedCountries || [];
                    }
                });
            }

            // Extract cohorts
            const cohorts = [...new Set(appList.map(a => a.cohort || a.countryOfResidence).filter(Boolean))].sort();

            setApplicants(appList);
            setScores(scoreMap);
            setUniqueCohorts(cohorts);
            setAssignedCohorts(userCohorts);

            const adminFlag = isUserAdmin(currentUser?.email, userCohorts);
            const allowedCohorts = adminFlag ? cohorts : cohorts.filter(c => userCohorts.includes(c));

            if (!selectedCohort || !allowedCohorts.includes(selectedCohort)) {
                if (allowedCohorts.length > 0) {
                    setSelectedCohort(allowedCohorts[0]);
                }
            }

        } catch (err) {
            console.error("Error fetching screening data:", err);
            alert(`Failed to load screening data for ${selectedYear}.`);
        } finally {
            setLoading(false);
        }
    }, [currentUser, selectedYear]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSaveScore = async (formData) => {
        if (!selectedApplicant) return;
        setIsSaving(true);
        try {
            const scoreId = `score_${selectedApplicant.id}`;
            const scorePayload = {
                id: scoreId,
                applicantId: selectedApplicant.id,
                screenerId: currentUser?.uid || 'unknown',
                screenerEmail: currentUser?.email || 'unknown',
                countryOfResidence: selectedApplicant.countryOfResidence || '',
                cohort: selectedApplicant.cohort || selectedApplicant.countryOfResidence || '',
                ...formData,
                updatedAt: new Date().toISOString()
            };

            const scoreCollName = selectedYear === '2026' ? 'screening_scores' : `screening_scores_${selectedYear}`;
            await setDoc(doc(db, "alumni", "screening_data", scoreCollName, scoreId), scorePayload);

            setScores(prev => ({
                ...prev,
                [selectedApplicant.id]: scorePayload
            }));

            // Also update status inside applicant object for quick badge rendering
            setApplicants(prev => prev.map(a => {
                if (a.id === selectedApplicant.id) {
                    return { ...a, status: 'Scored', totalScore: formData.totalScore, decision: formData.decision };
                }
                return a;
            }));

            alert("Score saved successfully!");
        } catch (err) {
            console.error("Error saving score:", err);
            alert("Failed to save score. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdateRank = async (applicantId, newRank) => {
        const scoreObj = scores[applicantId];
        if (!scoreObj) {
            alert("Please score the applicant before assigning a rank.");
            return;
        }

        const rankNum = newRank ? Number(newRank) : null;
        const updatedScore = { ...scoreObj, rankInCountry: rankNum };

        try {
            const scoreCollName = selectedYear === '2026' ? 'screening_scores' : `screening_scores_${selectedYear}`;
            await setDoc(doc(db, "alumni", "screening_data", scoreCollName, scoreObj.id || `score_${applicantId}`), updatedScore);
            setScores(prev => ({ ...prev, [applicantId]: updatedScore }));
        } catch (err) {
            console.error("Failed to update rank:", err);
        }
    };

    const cohortApplicants = applicants.filter(a => (a.cohort || a.countryOfResidence) === selectedCohort);

    const filteredApplicants = cohortApplicants.filter(a => {
        const scoreObj = scores[a.id];
        const status = a.autoDisqualified ? 'Disqualified' : (scoreObj ? 'Scored' : 'Pending');

        const matchesStatus = statusFilter === 'All' ? true : status === statusFilter;
        const matchesSearch = searchTerm ? (
            a.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.institution?.toLowerCase().includes(searchTerm.toLowerCase())
        ) : true;

        return matchesStatus && matchesSearch;
    });

    const scoredCohortCount = cohortApplicants.filter(a => scores[a.id] || a.autoDisqualified).length;

    const handleExportCohortExcel = () => {
        if (cohortApplicants.length === 0) {
            alert("No applicants in this cohort to export.");
            return;
        }

        const dataToExport = cohortApplicants.map(a => {
            const sc = scores[a.id] || {};
            return {
                "Submission Date": a.submissionDate || '',
                "Name": a.name || '',
                "Email": a.email || '',
                "Date of Birth": a.dateOfBirth || '',
                "Gender": a.gender || '',
                "Nationality": a.nationality || '',
                "Country of Residence": a.countryOfResidence || '',
                "Province / Cohort": a.cohort || '',
                "Have previously attended AAVC": a.previouslyAttendedAAVC || 'No',
                "Which year attended": a.attendanceYear || '',
                "Score_Previous AAVC": sc.scorePreviousAAVC !== undefined ? sc.scorePreviousAAVC : (a.autoDisqualified ? -1 : 1),
                "NITAG Member": a.isNITAGMember || 'No',
                "NITAG Role": a.nitagRole || '',
                "Highest Education": a.highestEducation || '',
                "Current Position": a.currentPosition || '',
                "Score_Current position": sc.scoreCurrentPosition !== undefined ? sc.scoreCurrentPosition : '',
                "Previous Experience in Vaccinology": a.previousExperience || '',
                "Spoken English": a.spokenEnglish || '',
                "Written English": a.writtenEnglish || '',
                "CV Link": getDocUrl(a.cvUrl) || '',
                "Score_CV": sc.scoreCVe !== undefined ? sc.scoreCVe : '',
                "Motivation Letter Link": getDocUrl(a.motivationLetterUrl) || '',
                "Score_Motivation letter": sc.scoreMotivationLetter !== undefined ? sc.scoreMotivationLetter : '',
                "Line Manager Name": a.lineManagerName || '',
                "Line Manager Email": a.lineManagerEmail || '',
                "Support Letter Link": getDocUrl(a.supportLetterUrl) || '',
                "Score_HOD letter": sc.scoreHODLetter !== undefined ? sc.scoreHODLetter : '',
                "Score_Completeness": sc.scoreCompleteness !== undefined ? sc.scoreCompleteness : '',
                "Total Score": sc.totalScore !== undefined ? sc.totalScore : '',
                "Rank in Cohort": sc.rankInCountry || '',
                "Accept/Reject": sc.decision || (a.autoDisqualified ? 'Reject' : ''),
                "Motivation for ranking/rejection": sc.comments || a.disqualificationReason || '',
                "Auto Disqualified Flag": a.autoDisqualified ? 'YES' : 'NO'
            };
        });

        // Sort by Total Score descending and Decision priority (Accept > Pending > Reject > DQ)
        dataToExport.sort((x, y) => {
            if (x["Rank in Cohort"] && y["Rank in Cohort"]) return Number(x["Rank in Cohort"]) - Number(y["Rank in Cohort"]);
            const scoreX = x["Total Score"] !== '' && x["Total Score"] !== undefined ? Number(x["Total Score"]) : (x["Auto Disqualified Flag"] === 'YES' ? -1 : 0);
            const scoreY = y["Total Score"] !== '' && y["Total Score"] !== undefined ? Number(y["Total Score"]) : (y["Auto Disqualified Flag"] === 'YES' ? -1 : 0);
            if (scoreX !== scoreY) return scoreY - scoreX;

            const dwX = getDecisionWeight(x["Accept/Reject"], x["Auto Disqualified Flag"] === 'YES');
            const dwY = getDecisionWeight(y["Accept/Reject"], y["Auto Disqualified Flag"] === 'YES');
            if (dwX !== dwY) return dwY - dwX;

            return (x["Name"] || '').localeCompare(y["Name"] || '');
        });

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `${selectedCohort.substring(0, 30)} Screening`);
        XLSX.writeFile(wb, `AAVC_${selectedYear}_Screening_${selectedCohort.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
    };

    const isAdmin = isUserAdmin(currentUser?.email, assignedCohorts);
    const visibleCohorts = isAdmin ? uniqueCohorts : uniqueCohorts.filter(c => assignedCohorts.includes(c));

    if (loading) {
        return <div className="workspace-loading">Loading screening workspace...</div>;
    }

    if (!isAdmin && visibleCohorts.length === 0) {
        return (
            <div className="screening-workspace" style={{ padding: '40px', textAlign: 'center' }}>
                <div className="alumni-form-card" style={{ maxWidth: '600px', margin: '0 auto', padding: '30px' }}>
                    <h3 style={{ color: '#d32f2f' }}>🔒 Access Restricted to Assigned Cohorts</h3>
                    <p style={{ marginTop: '15px', fontSize: '16px', lineHeight: '1.5' }}>
                        Hello <strong>{currentUser?.email}</strong>,<br /><br />
                        Your account has not been assigned any countries or provinces to review yet for <strong>AAVC {selectedYear}</strong>.
                        Screeners can only view applications belonging to their assigned cohorts.
                    </p>
                    <p style={{ marginTop: '15px', color: '#666' }}>
                        Please contact an administrator to assign your review cohorts in the administration portal.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="screening-workspace">
            <div className="workspace-top-bar">
                <div className="cohort-selector-box" style={{ marginRight: '20px' }}>
                    <label>Screening Year:</label>
                    <select 
                        value={selectedYear} 
                        onChange={(e) => {
                            setSelectedYear(e.target.value);
                            setSelectedApplicant(null);
                            setSelectedCohort('');
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

                <div className="cohort-selector-box">
                    <label>Select Cohort / Province:</label>
                    <select 
                        value={selectedCohort} 
                        onChange={(e) => {
                            setSelectedCohort(e.target.value);
                            setSelectedApplicant(null);
                        }}
                        className="cohort-select"
                    >
                        {visibleCohorts.map(c => (
                            <option key={c} value={c}>
                                {c} {!isAdmin && assignedCohorts.includes(c) ? '' : (assignedCohorts.includes(c) ? ' (Assigned to you)' : '')}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="cohort-progress">
                    <span>Progress for <strong>{selectedCohort}</strong>:</span>
                    <div className="progress-bar-wrapper">
                        <div 
                            className="progress-bar-fill" 
                            style={{ width: `${cohortApplicants.length ? (scoredCohortCount / cohortApplicants.length) * 100 : 0}%` }}
                        />
                    </div>
                    <strong>{scoredCohortCount} / {cohortApplicants.length} Scored</strong>
                </div>

                <div className="workspace-tab-buttons">
                    <button 
                        className={`tab-btn ${activeTab === 'review' ? 'active' : ''}`}
                        onClick={() => setActiveTab('review')}
                    >
                        📝 Review & Score Queue
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'ranking' ? 'active' : ''}`}
                        onClick={() => setActiveTab('ranking')}
                    >
                        🏆 Cohort Ranking Table
                    </button>
                    <button onClick={handleExportCohortExcel} className="btn-export-cohort">
                        📊 Export Cohort Excel
                    </button>
                    <span style={{ borderLeft: '2px solid rgba(255,255,255,0.3)', height: '28px', margin: '0 4px' }} />
                    <a 
                        href={`${import.meta.env.BASE_URL}guides/AAVC_Screening_Manual.pdf`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="btn-help-resource"
                        style={{ background: '#198754', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                        📖 Screening Manual
                    </a>
                    <button 
                        onClick={() => setShowVideoModal(true)}
                        className="btn-help-resource"
                        style={{ background: '#6f42c1', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                        🎬 Video Walkthrough
                    </button>
                </div>
            </div>

            {activeTab === 'review' ? (
                <div className="workspace-split-view">
                    {/* Left Queue Panel */}
                    <div className="queue-sidebar">
                        <div className="queue-controls">
                            <input 
                                type="text"
                                placeholder="Search applicant..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="queue-search"
                            />
                            <select 
                                value={statusFilter} 
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="queue-filter"
                            >
                                <option value="All">Status: All ({cohortApplicants.length})</option>
                                <option value="Pending">Pending ({cohortApplicants.filter(a => !scores[a.id] && !a.autoDisqualified).length})</option>
                                <option value="Scored">Scored ({cohortApplicants.filter(a => scores[a.id] && !a.autoDisqualified).length})</option>
                                <option value="Disqualified">Disqualified ({cohortApplicants.filter(a => a.autoDisqualified).length})</option>
                            </select>
                        </div>

                        <div className="queue-list">
                            {filteredApplicants.length > 0 ? (
                                filteredApplicants.map(app => (
                                    <ApplicantCard 
                                        key={app.id}
                                        applicant={app}
                                        isSelected={selectedApplicant?.id === app.id}
                                        onClick={() => setSelectedApplicant(app)}
                                        scoreData={scores[app.id]}
                                        rank={scores[app.id]?.rankInCountry}
                                    />
                                ))
                            ) : (
                                <p className="queue-empty">No applicants found matching filter.</p>
                            )}
                        </div>
                    </div>

                    {/* Right Details & Scoring Panel */}
                    <div className="detail-panel">
                        {selectedApplicant ? (
                            <div className="applicant-detail-container">
                                <div className="detail-header">
                                    <div className="detail-title-box">
                                        <h2>{selectedApplicant.name}</h2>
                                        <span className="detail-email">{selectedApplicant.email}</span>
                                    </div>
                                    {selectedApplicant.autoDisqualified && (
                                        <div className="dq-banner">
                                            ⚠️ <strong>AUTOMATIC DISQUALIFICATION FLAG:</strong> {selectedApplicant.disqualificationReason}
                                        </div>
                                    )}
                                </div>

                                <div className="info-cards-grid">
                                    <div className="info-card">
                                        <h4>Demographics & Contact</h4>
                                        <p><strong>DOB:</strong> {selectedApplicant.dateOfBirth || 'N/A'}</p>
                                        <p><strong>Gender:</strong> {selectedApplicant.gender || 'N/A'}</p>
                                        <p><strong>Nationality:</strong> {selectedApplicant.nationality || 'N/A'}</p>
                                        <p><strong>Residence:</strong> {selectedApplicant.countryOfResidence} ({selectedApplicant.province || 'General'})</p>
                                        <p><strong>Mobile:</strong> {selectedApplicant.mobilePhone || 'N/A'}</p>
                                    </div>

                                    <div className="info-card">
                                        <h4>Professional & Institution</h4>
                                        <p><strong>Position:</strong> {selectedApplicant.currentPosition || 'N/A'}</p>
                                        <p><strong>Institution:</strong> {selectedApplicant.institution || 'N/A'}</p>
                                        <p><strong>Address:</strong> {selectedApplicant.institutionAddress || 'N/A'}</p>
                                        <p><strong>Education:</strong> {selectedApplicant.highestEducation || 'N/A'}</p>
                                    </div>

                                    <div className="info-card">
                                        <h4>Vaccinology & NITAG Background</h4>
                                        <p><strong>Previous AAVC:</strong> {selectedApplicant.previouslyAttendedAAVC || 'No'} {selectedApplicant.attendanceYear ? `(${selectedApplicant.attendanceYear})` : ''}</p>
                                        <p><strong>NITAG Member:</strong> {selectedApplicant.isNITAGMember || 'No'} {selectedApplicant.nitagRole ? `— ${selectedApplicant.nitagRole}` : ''}</p>
                                        <p><strong>English (Spoken / Written):</strong> {selectedApplicant.spokenEnglish || 'N/A'} / {selectedApplicant.writtenEnglish || 'N/A'}</p>
                                        <p><strong>Other Courses:</strong> {selectedApplicant.attendedOtherCourse || 'No'}</p>
                                        {selectedApplicant.otherCourseDetail && <p className="detail-sub">{selectedApplicant.otherCourseDetail}</p>}
                                    </div>

                                    <div className="info-card">
                                        <h4>Line Manager Information</h4>
                                        <p><strong>Name:</strong> {selectedApplicant.lineManagerTitle} {selectedApplicant.lineManagerName || 'N/A'}</p>
                                        <p><strong>Email:</strong> {selectedApplicant.lineManagerEmail || 'N/A'}</p>
                                        <p><strong>Office Phone:</strong> {selectedApplicant.lineManagerOfficePhone || 'N/A'}</p>
                                        <p><strong>Mobile Phone:</strong> {selectedApplicant.lineManagerMobilePhone || 'N/A'}</p>
                                    </div>
                                </div>

                                <div className="docs-links-section">
                                    <h4>Uploaded Supporting Documents (Click to Open in New Tab)</h4>
                                    <div className="docs-buttons">
                                        {selectedApplicant.cvUrl ? (
                                            <a href={getGoogleViewerUrl(selectedApplicant.cvUrl)} target="_blank" rel="noopener noreferrer" className="doc-link-btn">
                                                📄 Open Abridged CV (Inline)
                                            </a>
                                        ) : (
                                            <span className="doc-missing">❌ No CV Uploaded</span>
                                        )}

                                        {selectedApplicant.motivationLetterUrl ? (
                                            <a href={getGoogleViewerUrl(selectedApplicant.motivationLetterUrl)} target="_blank" rel="noopener noreferrer" className="doc-link-btn">
                                                ✍️ Open Motivation Letter (Inline)
                                            </a>
                                        ) : (
                                            <span className="doc-missing">❌ No Motivation Letter</span>
                                        )}

                                        {selectedApplicant.supportLetterUrl ? (
                                            <a href={getGoogleViewerUrl(selectedApplicant.supportLetterUrl)} target="_blank" rel="noopener noreferrer" className="doc-link-btn">
                                                📑 Open HOD Support Letter (Inline)
                                            </a>
                                        ) : (
                                            <span className="doc-missing">❌ No HOD Letter</span>
                                        )}
                                    </div>
                                </div>

                                {selectedApplicant.previousExperience && (
                                    <div className="experience-box">
                                        <h4>Previous Relevant Work Experience</h4>
                                        <p>{selectedApplicant.previousExperience}</p>
                                        {selectedApplicant.previousExperienceDetail && (
                                            <p className="experience-detail">{selectedApplicant.previousExperienceDetail}</p>
                                        )}
                                    </div>
                                )}

                                <ScoringForm 
                                    applicant={selectedApplicant}
                                    existingScore={scores[selectedApplicant.id]}
                                    onSave={handleSaveScore}
                                    onCancel={() => setSelectedApplicant(null)}
                                    isSaving={isSaving}
                                />
                            </div>
                        ) : (
                            <div className="detail-placeholder">
                                <div className="placeholder-content">
                                    <h3>👆 Select an applicant from the left queue to review & score</h3>
                                    <p>Review their demographic info, supporting documents, and complete the official AAVC rubric.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* Cohort Ranking Table View */
                <div className="ranking-table-container">
                    <div className="ranking-header">
                        <h3>Cohort Ranking Table — {selectedCohort} ({cohortApplicants.length} Applicants)</h3>
                        <p>Rank your scored applicants from 1 (highest) to N. You can adjust ranks at any time and export the finalized Excel.</p>
                    </div>

                    <table className="ranking-table">
                        <thead>
                            <tr>
                                <th>Rank #</th>
                                <th>Name</th>
                                <th>Institution</th>
                                <th>Total Score</th>
                                <th>Decision</th>
                                <th>Motivation / Comments</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cohortApplicants
                                .slice()
                                .sort((x, y) => compareScoreAndDecision(x, y, scores[x.id], scores[y.id]))
                                .map(app => {
                                    const sc = scores[app.id] || {};
                                    const total = sc.totalScore !== undefined ? sc.totalScore : (app.autoDisqualified ? 'DQ' : '-');
                                    return (
                                        <tr key={app.id} className={app.autoDisqualified ? 'row-dq' : ''}>
                                            <td className="rank-input-cell">
                                                <input 
                                                    type="number" 
                                                    min="1" 
                                                    max={cohortApplicants.length}
                                                    value={sc.rankInCountry || ''}
                                                    onChange={(e) => handleUpdateRank(app.id, e.target.value)}
                                                    placeholder="-"
                                                    className="rank-input"
                                                />
                                            </td>
                                            <td className="font-bold">
                                                <span onClick={() => { setSelectedApplicant(app); setActiveTab('review'); }} className="clickable-name">
                                                    {app.name}
                                                </span>
                                            </td>
                                            <td>{app.institution || 'N/A'}</td>
                                            <td className="text-center font-bold text-primary">{total}</td>
                                            <td>
                                                <span className={`decision-tag decision-${(sc.decision || (app.autoDisqualified ? 'Reject' : 'Pending')).toLowerCase()}`}>
                                                    {sc.decision || (app.autoDisqualified ? 'Reject' : 'Pending')}
                                                </span>
                                            </td>
                                            <td className="comments-cell">{sc.comments || app.disqualificationReason || '—'}</td>
                                            <td>
                                                {app.autoDisqualified ? 'Disqualified' : (scores[app.id] ? 'Scored' : 'Pending')}
                                            </td>
                                        </tr>
                                    );
                                })}
                        </tbody>
                    </table>
                </div>
            )}

            {showVideoModal && (
                <div 
                    className="video-modal-overlay" 
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setShowVideoModal(false)}
                >
                    <div 
                        style={{ background: '#1e293b', borderRadius: '12px', padding: '16px', width: '90%', maxWidth: '900px', position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h3 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>🎬 Screening Process – Video Walkthrough</h3>
                            <button 
                                onClick={() => setShowVideoModal(false)} 
                                style={{ background: '#dc3545', color: '#fff', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                ✕
                            </button>
                        </div>
                        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '8px' }}>
                            <iframe 
                                src={GUIDE_VIDEO_EMBED_URL}
                                title="AAVC Screening Video Walkthrough"
                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScreeningWorkspace;
