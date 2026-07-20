import React from 'react';
import './ApplicantCard.css';

const ApplicantCard = ({ applicant, isSelected, onClick, scoreData, rank }) => {
    const status = applicant.status || 'Pending';
    const totalScore = scoreData?.totalScore !== undefined ? scoreData.totalScore : (applicant.totalScore !== undefined ? applicant.totalScore : null);
    const decision = scoreData?.decision || applicant.decision || null;

    let badgeClass = "badge-pending";
    if (status === 'Disqualified' || applicant.autoDisqualified) badgeClass = "badge-disqualified";
    else if (status === 'Scored' || totalScore !== null) badgeClass = "badge-scored";

    return (
        <div 
            className={`applicant-card ${isSelected ? 'selected' : ''} ${applicant.autoDisqualified ? 'disqualified' : ''}`}
            onClick={onClick}
        >
            <div className="card-header-row">
                <h3 className="applicant-name">
                    {rank && <span className="rank-badge">#{rank}</span>}
                    {applicant.name}
                </h3>
                <span className={`status-badge ${badgeClass}`}>
                    {applicant.autoDisqualified ? 'Disqualified' : (totalScore !== null ? 'Scored' : 'Pending')}
                </span>
            </div>

            <div className="card-meta">
                <span className="applicant-cohort">Cohort: <strong>{applicant.cohort || applicant.countryOfResidence}</strong></span>
                {applicant.institution && <span className="applicant-inst">{applicant.institution}</span>}
            </div>

            <div className="card-footer-row">
                {totalScore !== null && (
                    <div className="score-display">
                        Score: <strong className="score-num">{totalScore}</strong>
                    </div>
                )}
                {decision && (
                    <span className={`decision-tag decision-${decision.toLowerCase()}`}>
                        {decision}
                    </span>
                )}
                {applicant.autoDisqualified && (
                    <span className="dq-warning-text" title={applicant.disqualificationReason}>
                        ⚠️ DB/Attended Match
                    </span>
                )}
            </div>
        </div>
    );
};

export default ApplicantCard;
