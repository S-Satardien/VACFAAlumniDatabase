import React, { useState, useEffect } from 'react';
import './ScoringForm.css';

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

    useEffect(() => {
        if (existingScore) {
            setFormData({
                scorePreviousAAVC: existingScore.scorePreviousAAVC !== undefined ? Number(existingScore.scorePreviousAAVC) : 1,
                scoreCurrentPosition: existingScore.scoreCurrentPosition !== undefined ? Number(existingScore.scoreCurrentPosition) : 2,
                scoreCVe: existingScore.scoreCVe !== undefined ? Number(existingScore.scoreCVe) : 1,
                scoreMotivationLetter: existingScore.scoreMotivationLetter !== undefined ? Number(existingScore.scoreMotivationLetter) : 1,
                scoreHODLetter: existingScore.scoreHODLetter !== undefined ? Number(existingScore.scoreHODLetter) : 1,
                scoreCompleteness: existingScore.scoreCompleteness !== undefined ? Number(existingScore.scoreCompleteness) : 1,
                decision: existingScore.decision || 'Accept',
                comments: existingScore.comments || ''
            });
        } else if (applicant) {
            setFormData({
                scorePreviousAAVC: applicant.autoDisqualified ? -1 : 1,
                scoreCurrentPosition: 2,
                scoreCVe: 1,
                scoreMotivationLetter: 1,
                scoreHODLetter: 1,
                scoreCompleteness: 1,
                decision: applicant.autoDisqualified ? 'Reject' : 'Accept',
                comments: applicant.disqualificationReason || ''
            });
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

            <div className="decision-section">
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

                <div className="comments-field">
                    <label className="rubric-label">Motivation / Comments for Ranking & Decision</label>
                    <textarea 
                        value={formData.comments} 
                        onChange={(e) => handleChange('comments', e.target.value)}
                        placeholder="Provide comments or reason for ranking/rejection..."
                        rows={3}
                        className="comments-textarea"
                    />
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
