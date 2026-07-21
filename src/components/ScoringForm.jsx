import React, { useState, useEffect } from 'react';
import './ScoringForm.css';

const PRESET_GROUPS = [
    {
        label: "🟢 Acceptance / High Priority Motivations",
        presets: [
            "Directly involved in EPI / immunization programme. Strong potential to benefit from the course.",
            "Works directly in vaccine clinical trials / research. High capacity to benefit.",
            "Works in vaccine product development, manufacturing, or regulatory affairs.",
            "Strong application with clear demonstration of need and capacity to benefit.",
            "Occupies key role in maternal / adult vaccination or surveillance. Strong recommendation.",
            "Newly appointed to a key immunization / public health role. High potential to benefit."
        ]
    },
    {
        label: "🟡 Review / Reserve Motivations",
        presets: [
            "Good application and capacity to benefit, but ranked lower due to country cohort size limits.",
            "Indirectly involved in vaccine field / public health. May benefit from online course.",
            "Early career / junior role with strong interest in vaccinology.",
            "Involved in academic research / virology without direct clinical immunization involvement."
        ]
    },
    {
        label: "🔴 Rejection / Disqualification Motivations",
        presets: [
            "Not working directly with immunization programme or human vaccinology.",
            "Incomplete application or missing required supporting documents (CV / Motivation / HOD letter).",
            "No line manager / supervisor recommendation letter or approval.",
            "Weak motivation letter and no demonstrated capacity to benefit.",
            "Applicant previously attended AAVC (verified in alumni database).",
            "Work focus is in veterinary / non-human vaccinology."
        ]
    }
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

    const [selectedPresets, setSelectedPresets] = useState([]);
    const [customComment, setCustomComment] = useState('');

    useEffect(() => {
        const parseComments = (rawComments) => {
            const allPresets = PRESET_GROUPS.flatMap(g => g.presets);
            const matched = [];
            let remaining = rawComments || '';

            allPresets.forEach(p => {
                if (remaining.includes(p)) {
                    matched.push(p);
                    remaining = remaining.replace(p, '');
                }
            });

            const cleanedCustom = remaining
                .split('\n')
                .map(line => line.replace(/^[•\-\*;\s]+/, '').replace(/[;\s]+$/, '').trim())
                .filter(Boolean)
                .join('\n');

            setSelectedPresets(matched);
            setCustomComment(cleanedCustom);
        };

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
            parseComments(currentComments);
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
            parseComments(initialComments);
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

    const updateCommentsField = (presets, custom) => {
        const parts = [...presets];
        if (custom.trim()) {
            parts.push(custom.trim());
        }
        const combined = parts.map(p => `• ${p}`).join('\n');
        handleChange('comments', combined);
    };

    const handleCheckboxToggle = (preset) => {
        let nextPresets;
        if (selectedPresets.includes(preset)) {
            nextPresets = selectedPresets.filter(p => p !== preset);
        } else {
            nextPresets = [...selectedPresets, preset];
        }
        setSelectedPresets(nextPresets);
        updateCommentsField(nextPresets, customComment);
    };

    const handleCustomCommentChange = (e) => {
        const val = e.target.value;
        setCustomComment(val);
        updateCommentsField(selectedPresets, val);
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

                <div className="comments-field" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <label className="rubric-label">
                        Motivation / Comments for Ranking & Decision
                        <span className="rubric-subtext">Select all applicable standard motivations and/or add custom notes below</span>
                    </label>

                    <div className="presets-multi-select-box" style={{ 
                        border: '1px solid #cbd5e1', 
                        borderRadius: '8px', 
                        padding: '12px', 
                        maxHeight: '260px', 
                        overflowY: 'auto', 
                        backgroundColor: '#f8fafc',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                    }}>
                        {PRESET_GROUPS.map((group, gIdx) => (
                            <div key={gIdx} className="preset-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <strong style={{ fontSize: '0.85rem', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
                                    {group.label}
                                </strong>
                                {group.presets.map((preset, pIdx) => {
                                    const isChecked = selectedPresets.includes(preset);
                                    return (
                                        <label key={pIdx} style={{ 
                                            display: 'flex', 
                                            alignItems: 'flex-start', 
                                            gap: '8px', 
                                            fontSize: '0.85rem', 
                                            cursor: 'pointer',
                                            color: isChecked ? '#0f172a' : '#475569',
                                            fontWeight: isChecked ? '600' : 'normal',
                                            padding: '4px',
                                            borderRadius: '4px',
                                            backgroundColor: isChecked ? '#e0f2fe' : 'transparent'
                                        }}>
                                            <input 
                                                type="checkbox" 
                                                checked={isChecked} 
                                                onChange={() => handleCheckboxToggle(preset)}
                                                style={{ marginTop: '2px', cursor: 'pointer' }}
                                            />
                                            <span>{preset}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569' }}>
                            ✏️ Additional Custom Comments / Notes:
                        </label>
                        <textarea 
                            value={customComment} 
                            onChange={handleCustomCommentChange}
                            placeholder="Type any custom motivation, interview notes, or clarification here..."
                            rows={3}
                            className="comments-textarea"
                            style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px' }}
                        />
                    </div>
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
