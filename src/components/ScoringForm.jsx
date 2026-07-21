import React, { useState, useEffect } from 'react';
import './ScoringForm.css';

const MOTIVATION_PRESETS = [
    // Acceptance / High Priority
    "Directly involved in EPI / immunization programme. Strong potential to benefit from the course.",
    "Works directly in vaccine clinical trials / research. High capacity to benefit.",
    "Works in vaccine product development, manufacturing, or regulatory affairs.",
    "Strong application with clear demonstration of need and capacity to benefit.",
    "Occupies key role in maternal / adult vaccination or surveillance. Strong recommendation.",
    "Newly appointed to a key immunization / public health role. High potential to benefit.",
    // Review / Reserve
    "Good application and capacity to benefit, but ranked lower due to country cohort size limits.",
    "Indirectly involved in vaccine field / public health. May benefit from online course.",
    "Early career / junior role with strong interest in vaccinology.",
    "Involved in academic research / virology without direct clinical immunization involvement.",
    // Rejection / Disqualification
    "Not working directly with immunization programme or human vaccinology.",
    "Incomplete application or missing required supporting documents (CV / Motivation / HOD letter).",
    "No line manager / supervisor recommendation letter or approval.",
    "Weak motivation letter and no demonstrated capacity to benefit.",
    "Applicant previously attended AAVC (verified in alumni database).",
    "Work focus is in veterinary / non-human vaccinology."
];

const ScoringForm = ({ applicant, existingScore, onSave, onCancel, isSaving }) => {
    const [formData, setFormData] = useState({
        scorePreviousAAVC: applicant?.autoDisqualified ? -1 : 1,
        scoreCurrentPosition: 2,
        scoreCVe: 1,
        scoreMotivationLetter: 1,
        scoreHODLetter: 1,
        scoreCompleteness: 1,
        decision: applicant?.autoDisqualified ? 'Reject' : 'Accept',
        comments: applicant?.disqualificationReason || ''
    });

    const [selectedPreset, setSelectedPreset] = useState('');

    useEffect(() => {
        if (existingScore) {
            const currentComments = existingScore.comments || '';
            setFormData({
                scorePreviousAAVC: existingScore.scorePreviousAAVC !== undefined ? Number(existingScore.scorePreviousAAVC) : 1,
                scoreCurrentPosition: existingScore.scoreCurrentPosition !== undefined ? Number(existingScore.scoreCurrentPosition) : 2,
                scoreCVe: existingScore.scoreCVe !== undefined ? Number(existingScore.scoreCVe) : 1,
                scoreMotivationLetter: existingScore.scoreMotivationLetter !== undefined ? Number(existingScore.scoreMotivationLetter) : 1,
                scoreHODLetter: existingScore.scoreHODLetter !== undefined ? Number(existingScore.scoreHODLetter) : 1,
                scoreCompleteness: existingScore.scoreCompleteness !== undefined ? Number(existingScore.scoreCompleteness) : 1,
                decision: existingScore.decision || 'Accept',
                comments: currentComments
            });
            if (MOTIVATION_PRESETS.includes(currentComments)) {
                setSelectedPreset(currentComments);
            } else if (currentComments.trim() !== '') {
                setSelectedPreset('Other');
            } else {
                setSelectedPreset('');
            }
        } else if (applicant) {
            const initialComments = applicant.disqualificationReason || '';
            setFormData({
                scorePreviousAAVC: applicant.autoDisqualified ? -1 : 1,
                scoreCurrentPosition: 2,
                scoreCVe: 1,
                scoreMotivationLetter: 1,
                scoreHODLetter: 1,
                scoreCompleteness: 1,
                decision: applicant.autoDisqualified ? 'Reject' : 'Accept',
                comments: initialComments
            });
            if (MOTIVATION_PRESETS.includes(initialComments)) {
                setSelectedPreset(initialComments);
            } else if (initialComments.trim() !== '') {
                setSelectedPreset('Other');
            } else {
                setSelectedPreset('');
            }
        }
    }, [existingScore, applicant]);

    const calculateTotal = (data) => {
        return Number(data.scorePreviousAAVC) + 
               Number(data.scoreCurrentPosition) + 
               Number(data.scoreCVe) + 
               Number(data.scoreMotivationLetter) + 
               Number(data.scoreHODLetter) + 
               Number(data.scoreCompleteness);
    };

    const totalScore = calculateTotal(formData);

    const handleChange = (field, value) => {
        const newData = { ...formData, [field]: value };
        setFormData(newData);
    };

    const handlePresetChange = (e) => {
        const val = e.target.value;
        setSelectedPreset(val);
        if (val && val !== 'Other') {
            handleChange('comments', val);
        } else if (val === 'Other') {
            // Keep existing text or clear if it was a preset
            if (MOTIVATION_PRESETS.includes(formData.comments)) {
                handleChange('comments', '');
            }
        } else {
            handleChange('comments', '');
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            ...formData,
            totalScore: calculateTotal(formData)
        });
    };

    return (
        <form className="scoring-form" onSubmit={handleSubmit}>
            <div className="scoring-header-bar">
                <h3>Official AAVC 2026 Scoring Template</h3>
                <div className="total-score-box">
                    <span>Total Score:</span>
                    <strong className="total-score-value">{totalScore} / 7</strong>
                </div>
            </div>

            <div className="rubric-grid">
                {/* 1. Previous AAVC Attendance */}
                <div className="rubric-item">
                    <label className="rubric-label">
                        1. Attended AAVC Previously
                        <span className="rubric-subtext">Confirm attendance against database / self-report</span>
                    </label>
                    <select 
                        value={formData.scorePreviousAAVC} 
                        onChange={(e) => handleChange('scorePreviousAAVC', Number(e.target.value))}
                        className="rubric-select"
                        disabled={applicant?.autoDisqualified}
                    >
                        <option value={1}>1 : Has not attended before (Name not in DB)</option>
                        <option value={-1}>-1 : Has attended before (Name in DB - Auto-disqualify)</option>
                    </select>
                </div>

                {/* 2. Current Position Score */}
                <div className="rubric-item">
                    <label className="rubric-label">
                        2. Current Position Score
                        <span className="rubric-subtext">Relevance of current role to human vaccinology</span>
                    </label>
                    <select 
                        value={formData.scoreCurrentPosition} 
                        onChange={(e) => handleChange('scoreCurrentPosition', Number(e.target.value))}
                        className="rubric-select"
                    >
                        <option value={2}>2 : Works in vaccine field directly</option>
                        <option value={1}>1 : Works in vaccine field indirectly</option>
                        <option value={0}>0 : Non-human vaccine work (vet/unrelated)</option>
                    </select>
                </div>

                {/* 3. CV Score */}
                <div className="rubric-item">
                    <label className="rubric-label">
                        3. Curriculum Vitae (CV) Score
                        <span className="rubric-subtext">Evaluate quality and background from uploaded CV</span>
                    </label>
                    <select 
                        value={formData.scoreCVe} 
                        onChange={(e) => handleChange('scoreCVe', Number(e.target.value))}
                        className="rubric-select"
                    >
                        <option value={1}>1 : Impressive CV</option>
                        <option value={0}>0 : Not impressive CV</option>
                    </select>
                </div>

                {/* 4. Motivation Letter Score */}
                <div className="rubric-item">
                    <label className="rubric-label">
                        4. Motivation Letter Score
                        <span className="rubric-subtext">Evaluate clarity and motivation for attending</span>
                    </label>
                    <select 
                        value={formData.scoreMotivationLetter} 
                        onChange={(e) => handleChange('scoreMotivationLetter', Number(e.target.value))}
                        className="rubric-select"
                    >
                        <option value={1}>1 : Strong motivation letter</option>
                        <option value={0}>0 : Weak motivation letter</option>
                    </select>
                </div>

                {/* 5. HOD Letter Score */}
                <div className="rubric-item">
                    <label className="rubric-label">
                        5. HOD / Supervisor Letter Score
                        <span className="rubric-subtext">Support and recommendation letter quality</span>
                    </label>
                    <select 
                        value={formData.scoreHODLetter} 
                        onChange={(e) => handleChange('scoreHODLetter', Number(e.target.value))}
                        className="rubric-select"
                    >
                        <option value={1}>1 : Impressive recommendation</option>
                        <option value={0}>0 : Not impressive recommendation</option>
                    </select>
                </div>

                {/* 6. Completeness of Application */}
                <div className="rubric-item">
                    <label className="rubric-label">
                        6. Completeness of Application
                        <span className="rubric-subtext">Check if all required documents are present</span>
                    </label>
                    <select 
                        value={formData.scoreCompleteness} 
                        onChange={(e) => handleChange('scoreCompleteness', Number(e.target.value))}
                        className="rubric-select"
                    >
                        <option value={1}>1 : Complete (All supporting docs uploaded)</option>
                        <option value={0}>0 : Incomplete (Some docs missing)</option>
                    </select>
                </div>
            </div>

            <div className="decision-section" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="decision-field">
                    <label className="rubric-label">Final Decision</label>
                    <select 
                        value={formData.decision} 
                        onChange={(e) => handleChange('decision', e.target.value)}
                        className={`decision-select decision-opt-${formData.decision?.toLowerCase()}`}
                    >
                        <option value="Accept">Accept</option>
                        <option value="Reject">Reject</option>
                        <option value="Pending">Pending / Under Review</option>
                    </select>
                </div>

                <div className="comments-field" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label className="rubric-label">Motivation / Comments for Ranking & Decision</label>
                    <select
                        value={selectedPreset}
                        onChange={handlePresetChange}
                        className="rubric-select"
                        style={{ padding: '10px', fontSize: '0.95rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                    >
                        <option value="">-- Select Standard Motivation / Comment --</option>
                        <optgroup label="🟢 Acceptance / High Priority Motivations">
                            <option value="Directly involved in EPI / immunization programme. Strong potential to benefit from the course.">Directly involved in EPI / immunization programme. Strong potential to benefit from the course.</option>
                            <option value="Works directly in vaccine clinical trials / research. High capacity to benefit.">Works directly in vaccine clinical trials / research. High capacity to benefit.</option>
                            <option value="Works in vaccine product development, manufacturing, or regulatory affairs.">Works in vaccine product development, manufacturing, or regulatory affairs.</option>
                            <option value="Strong application with clear demonstration of need and capacity to benefit.">Strong application with clear demonstration of need and capacity to benefit.</option>
                            <option value="Occupies key role in maternal / adult vaccination or surveillance. Strong recommendation.">Occupies key role in maternal / adult vaccination or surveillance. Strong recommendation.</option>
                            <option value="Newly appointed to a key immunization / public health role. High potential to benefit.">Newly appointed to a key immunization / public health role. High potential to benefit.</option>
                        </optgroup>
                        <optgroup label="🟡 Review / Reserve Motivations">
                            <option value="Good application and capacity to benefit, but ranked lower due to country cohort size limits.">Good application and capacity to benefit, but ranked lower due to country cohort size limits.</option>
                            <option value="Indirectly involved in vaccine field / public health. May benefit from online course.">Indirectly involved in vaccine field / public health. May benefit from online course.</option>
                            <option value="Early career / junior role with strong interest in vaccinology.">Early career / junior role with strong interest in vaccinology.</option>
                            <option value="Involved in academic research / virology without direct clinical immunization involvement.">Involved in academic research / virology without direct clinical immunization involvement.</option>
                        </optgroup>
                        <optgroup label="🔴 Rejection / Disqualification Motivations">
                            <option value="Not working directly with immunization programme or human vaccinology.">Not working directly with immunization programme or human vaccinology.</option>
                            <option value="Incomplete application or missing required supporting documents (CV / Motivation / HOD letter).">Incomplete application or missing required supporting documents (CV / Motivation / HOD letter).</option>
                            <option value="No line manager / supervisor recommendation letter or approval.">No line manager / supervisor recommendation letter or approval.</option>
                            <option value="Weak motivation letter and no demonstrated capacity to benefit.">Weak motivation letter and no demonstrated capacity to benefit.</option>
                            <option value="Applicant previously attended AAVC (verified in alumni database).">Applicant previously attended AAVC (verified in alumni database).</option>
                            <option value="Work focus is in veterinary / non-human vaccinology.">Work focus is in veterinary / non-human vaccinology.</option>
                        </optgroup>
                        <optgroup label="✏️ Custom Option">
                            <option value="Other">Other (Specify custom motivation below...)</option>
                        </optgroup>
                    </select>

                    {selectedPreset === 'Other' && (
                        <textarea 
                            value={formData.comments} 
                            onChange={(e) => handleChange('comments', e.target.value)}
                            placeholder="Provide custom comments or reason for ranking/rejection..."
                            rows={3}
                            className="comments-textarea"
                            style={{ marginTop: '4px', border: '1px solid #3b82f6', borderRadius: '8px', padding: '10px' }}
                        />
                    )}
                </div>
            </div>

            <div className="form-actions-bar">
                <button type="button" onClick={onCancel} className="btn-cancel" disabled={isSaving}>
                    Cancel
                </button>
                <button type="submit" className="btn-save" disabled={isSaving}>
                    {isSaving ? 'Saving Score...' : 'Save & Record Score'}
                </button>
            </div>
        </form>
    );
};

export default ScoringForm;
