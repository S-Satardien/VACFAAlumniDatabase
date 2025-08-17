import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig'; 
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore'; 
import '../App.css'; 

function AlumniForm({ onClose, onSave, alumnusToEdit, uniquePrograms }) { 
  const [formData, setFormData] = useState({
    Name: '',
    Year: '',
    Country: '',
    Email: '',
    Role: '',
    Region: '',
    Language: '',
    Comments: '',
    IsNITAGMember: '', 
    CurrentPosition: '',
    Institution: '',
    Nationality: '', 
    Program: '' 
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // If alumnusToEdit is provided, populate the form with their data
  useEffect(() => {
    if (alumnusToEdit) { 
      setFormData({
        Name: alumnusToEdit.Name || '',
        Year: alumnusToEdit.Year || '',
        Country: alumnusToEdit.Country || '',
        Email: alumnusToEdit.Email || '',
        Role: alumnusToEdit.Role || '', // CORRECTED: alumnusToEdit.Role
        Region: alumnusToEdit.Region || '',
        Language: alumnusToEdit.Language || '',
        Comments: alumnusToEdit.Comments || '',
        IsNITAGMember: alumnusToEdit.IsNITAGMember || '',
        CurrentPosition: alumnusToEdit.CurrentPosition || '',
        Institution: alumnusToEdit.Institution || '',
        Nationality: alumnusToEdit.Nationality || '', 
        Program: alumnusToEdit.Program || '' 
      });
    } else {
      // Clear form if not editing (i.e., adding a new entry)
      setFormData({
        Name: '', Year: '', Country: '', Email: '', Role: '',
        Region: '', Language: '', Comments: '', IsNITAGMember: '',
        CurrentPosition: '', Institution: '', Nationality: '', 
        Program: '' 
      });
    }
  }, [alumnusToEdit]); 

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const dataToSave = {};
    for (const key in formData) {
        if (formData[key] !== '' && formData[key] !== null) { 
            dataToSave[key] = formData[key];
        }
    }

    try {
      if (alumnusToEdit) {
        const alumnusDocRef = doc(db, 'alumni', alumnusToEdit.id);
        await updateDoc(alumnusDocRef, dataToSave); 
        console.log("Alumnus updated with ID: ", alumnusToEdit.id);
      } else {
        const docRef = await addDoc(collection(db, 'alumni'), dataToSave); 
        console.log("Alumnus added with ID: ", docRef.id);
      }
      onSave(); 
    } catch (err) {
      console.error("Error saving alumnus: ", err);
      setError("Failed to save alumnus. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="alumni-form-overlay">
      <div className="alumni-form-card">
        <h2>{alumnusToEdit ? 'Edit Alumnus' : 'Add New Alumnus'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="Name">Name:</label>
            <input type="text" id="Name" name="Name" value={formData.Name} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label htmlFor="Program">Program:</label> 
            <select id="Program" name="Program" value={formData.Program} onChange={handleChange} required>
              <option value="">Select Program</option>
              {uniquePrograms.map(program => (
                <option key={program} value={program}>{program}</option>
              ))}
              {!uniquePrograms.includes('AVCN') && <option value="AVCN">AVCN</option>}
              {!uniquePrograms.includes('AAVC') && <option value="AAVC">AAVC</option>}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="Year">Year:</label>
            <input type="text" id="Year" name="Year" value={formData.Year} onChange={handleChange} placeholder="e.g., AVCN 2024 or 2024" />
          </div>
          <div className="form-group">
            <label htmlFor="Country">Country:</label>
            <input type="text" id="Country" name="Country" value={formData.Country} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="Nationality">Nationality:</label> 
            <input type="text" id="Nationality" name="Nationality" value={formData.Nationality} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="Email">Email:</label>
            <input type="email" id="Email" name="Email" value={formData.Email} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="Role">Role:</label>
            <input type="text" id="Role" name="Role" value={formData.Role} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="CurrentPosition">Current Position:</label> 
            <input type="text" id="CurrentPosition" name="CurrentPosition" value={formData.CurrentPosition} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="Institution">Institution:</label>
            <input type="text" id="Institution" name="Institution" value={formData.Institution} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="IsNITAGMember">NITAG Member (Yes/No):</label>
            <input type="text" id="IsNITAGMember" name="IsNITAGMember" value={formData.IsNITAGMember} onChange={handleChange} placeholder="Yes or No" />
          </div>
          <div className="form-group">
            <label htmlFor="Region">Region:</label>
            <input type="text" id="Region" name="Region" value={formData.Region} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="Language">Language:</label>
            <input type="text" id="Language" name="Language" value={formData.Language} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="Comments">Comments:</label>
            <textarea id="Comments" name="Comments" value={formData.Comments} onChange={handleChange}></textarea>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : (alumnusToEdit ? 'Update Alumnus' : 'Add Alumnus')}
            </button>
            <button type="button" onClick={onClose} disabled={isSubmitting} className="cancel-button">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AlumniForm;