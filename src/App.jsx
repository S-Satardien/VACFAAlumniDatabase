import React, { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from './firebaseConfig';
import './App.css';
import Header from './components/Header';
import AlumniForm from './components/AlumniForm';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';

import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import Login from './components/Login';

function App() {
    const { currentUser, logout } = useAuth();

    const [alumni, setAlumni] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedYear, setSelectedYear] = useState('');
    const [selectedCountry, setSelectedCountry] = useState('');
    const [selectedProgram, setSelectedProgram] = useState('');

    const [uniqueYears, setUniqueYears] = useState([]);
    const [uniqueCountries, setUniqueCountries] = useState([]);
    const [uniquePrograms, setUniquePrograms] = useState([]);

    const [filteredAlumni, setFilteredAlumni] = useState([]);

    const [showForm, setShowForm] = useState(false);
    const [alumnusToEdit, setAlumnusToEdit] = useState(null);

    const [attendeesByYear, setAttendeesByYear] = useState([]);
    const [attendeesByCountry, setAttendeesByCountry] = useState([]);

    // Data Fetching Function
    const getAlumni = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const alumniCollectionRef = query(collection(db, 'alumni'), orderBy('Name', 'asc'));
            const data = await getDocs(alumniCollectionRef);
            const fetchedAlumni = data.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            setAlumni(fetchedAlumni);

            // CORRECTED: Ensure Year is a string before uniqueness check
            const years = [...new Set(fetchedAlumni.map(person => String(person.Year)).filter(Boolean))].sort((a, b) => parseInt(a) - parseInt(b));
            setUniqueYears(years);

            const countries = [...new Set(fetchedAlumni.map(person => person.Country).filter(Boolean))].sort();
            setUniqueCountries(countries);

            // CORRECTED: Ensure Program is a string before uniqueness check
            let programs = [...new Set(fetchedAlumni.map(person => String(person.Program)).filter(Boolean))].sort();
            if (fetchedAlumni.some(p => p.Program === 'AVCN') && !programs.includes('AVCN')) programs.push('AVCN');
            if (fetchedAlumni.some(p => p.Program === 'AAVC') && !programs.includes('AAVC')) programs.push('AAVC');
            programs.sort();
            setUniquePrograms(programs);

        } catch (err) {
            console.error("Error fetching alumni: ", err);
            setError("Failed to load alumni data.");
        } finally {
            setLoading(false);
        }
    }, []);


    useEffect(() => {
        if (currentUser) {
            getAlumni();
        } else {
            setAlumni([]);
            setFilteredAlumni([]);
            setAttendeesByYear([]);
            setAttendeesByCountry([]);
            setLoading(false);
        }
    }, [currentUser, getAlumni]);


    // Separate Effect for Data Aggregation for Charts (unchanged in logic, only uses already processed data)
    useEffect(() => {
        if (alumni.length === 0 || uniquePrograms.length === 0) {
            setAttendeesByYear([]);
            setAttendeesByCountry([]);
            return;
        }

        const yearProgramCounts = {};
        const countryProgramCounts = {};

        alumni.forEach(person => {
            if (person.Year && person.Program) {
                // Ensure year and program are strings for consistent keying
                const yearStr = String(person.Year);
                const programStr = String(person.Program);

                if (!yearProgramCounts[yearStr]) { yearProgramCounts[yearStr] = {}; }
                if (!yearProgramCounts[yearStr][programStr]) { yearProgramCounts[yearStr][programStr] = 0; }
                yearProgramCounts[yearStr][programStr]++;
            }
            if (person.Country && person.Program) {
                // Ensure country and program are strings for consistent keying
                const countryStr = String(person.Country);
                const programStr = String(person.Program);

                if (!countryProgramCounts[countryStr]) { countryProgramCounts[countryStr] = {}; }
                if (!countryProgramCounts[countryStr][programStr]) { countryProgramCounts[countryStr][programStr] = 0; }
                countryProgramCounts[countryStr][programStr]++;
            }
        });

        const allYearsInData = [...new Set(alumni.map(p => String(p.Year)).filter(Boolean))].sort((a, b) => parseInt(a) - parseInt(b));

        const aggregatedYearData = allYearsInData.map(year => {
            const yearData = { year };
            uniquePrograms.forEach(program => {
                yearData[program] = yearProgramCounts[year]?.[program] || 0;
            });
            return yearData;
        });
        setAttendeesByYear(aggregatedYearData);

        const totalCountryCounts = {};
        for (const country in countryProgramCounts) {
            totalCountryCounts[country] = Object.values(countryProgramCounts[country]).reduce((sum, count) => sum + count, 0);
        }
        const topCountries = Object.keys(totalCountryCounts)
            .sort((a, b) => totalCountryCounts[b] - totalCountryCounts[a])
            .slice(0, 10);

        const aggregatedCountryData = topCountries.map(country => {
            const countryData = { country };
            uniquePrograms.forEach(program => {
                countryData[program] = countryProgramCounts[country]?.[program] || 0;
            });
            return countryData;
        });
        setAttendeesByCountry(aggregatedCountryData);

    }, [alumni, uniquePrograms]);

    // Effect to filter alumni (unchanged)
    useEffect(() => {
        const lowercasedSearchTerm = searchTerm.toLowerCase();
        const results = alumni.filter(person => {
            const matchesSearchTerm = (
                person.Name?.toLowerCase().includes(lowercasedSearchTerm) ||
                person.Country?.toLowerCase().includes(lowercasedSearchTerm) ||
                person.Year?.toString().includes(lowercasedSearchTerm) ||
                person.Email?.toLowerCase().includes(lowercasedSearchTerm) ||
                person.Role?.toLowerCase().includes(lowercasedSearchTerm) ||
                person.Region?.toLowerCase().includes(lowercasedSearchTerm) ||
                person.Language?.toLowerCase().includes(lowercasedSearchTerm) ||
                person.Comments?.toLowerCase().includes(lowercasedSearchTerm)
            );
            const matchesYear = selectedYear ? (person.Year?.toString() === selectedYear) : true;
            const matchesCountry = selectedCountry ? (person.Country === selectedCountry) : true;
            const matchesProgram = selectedProgram ? (person.Program === selectedProgram) : true;
            return matchesSearchTerm && matchesYear && matchesCountry && matchesProgram;
        });
        setFilteredAlumni(results);
    }, [searchTerm, alumni, selectedYear, selectedCountry, selectedProgram]);

    const clearFilters = () => {
        setSearchTerm('');
        setSelectedYear('');
        setSelectedCountry('');
        setSelectedProgram('');
    };

    const handleAddAlumnusClick = () => {
        setAlumnusToEdit(null);
        setShowForm(true);
    };

    const handleEditAlumnusClick = (alumnus) => {
        setAlumnusToEdit(alumnus);
        setShowForm(true);
    };

    const handleFormClose = () => {
        setShowForm(false);
        setAlumnusToEdit(null);
    };

    const handleFormSave = () => {
        handleFormClose();
        getAlumni();
    };

    const handleExportToExcel = () => {
        if (filteredAlumni.length === 0) {
            alert("No alumni to export. Please adjust your filters.");
            return;
        }

        const dataToExport = filteredAlumni.map(person => ({
            "Name": person.Name || '',
            "Program": person.Program || '',
            "Year": person.Year || '',
            "Country": person.Country || '',
            "Nationality": person.Nationality || '',
            "Email": person.Email || '',
            "Role": person.Role || '',
            "Current Position": person.CurrentPosition || '',
            "Institution": person.Institution || '',
            "NITAG Member": person.IsNITAGMember || '',
            "Region": person.Region || '',
            "Language": person.Language || '',
            "Comments": person.Comments || '',
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Alumni Data");
        XLSX.writeFile(wb, "Alumni_Report.xlsx");
    };


    if (loading) {
        return <div className="App">Loading alumni...</div>;
    }

    if (error) {
        return <div className="App" style={{ color: 'red' }}>Error: {error}</div>;
    }

    const programColors = {
        'AVCN': getComputedStyle(document.documentElement).getPropertyValue('--primary-color'),
        'AAVC': getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'),
    };

    const chartProgramOrder = ['AAVC', 'AVCN'];


    const handleLogout = async () => {
        try {
            await logout();
        } catch (err) {
            console.error("Failed to log out:", err);
            alert("Failed to log out. Please try again.");
        }
    };


    if (!currentUser) {
        return (
            <div className="App">
                <Login />
            </div>
        );
    }

    return (
        <div className="App">
            <Header searchTerm={searchTerm} setSearchTerm={setSearchTerm} onLogout={handleLogout} />

            <div className="content-area-wrapper">
                <div className="main-content-panel">
                    <div className="filters-container">
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value)}
                            className="filter-dropdown"
                        >
                            <option value="">Filter by Year</option>
                            {uniqueYears.map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>

                        <select
                            value={selectedCountry}
                            onChange={(e) => setSelectedCountry(e.target.value)}
                            className="filter-dropdown"
                        >
                            <option value="">Filter by Country</option>
                            {uniqueCountries.map(country => (
                                <option key={country} value={country}>{country}</option>
                            ))}
                        </select>

                        <select
                            value={selectedProgram}
                            onChange={(e) => setSelectedProgram(e.target.value)}
                            className="filter-dropdown"
                        >
                            <option value="">Filter by Program</option>
                            {uniquePrograms.map(program => (
                                <option key={program} value={program}>{program}</option>
                            ))}
                        </select>

                        {(searchTerm || selectedYear || selectedCountry || selectedProgram) && (
                            <button onClick={clearFilters} className="clear-filters-button">Clear All Filters</button>
                        )}

                        <button onClick={handleAddAlumnusClick} className="add-alumnus-button">
                            Add New Alumnus
                        </button>

                        <button onClick={handleExportToExcel} className="export-button">
                            Export to Excel
                        </button>

                    </div>

                    <div className="alumni-list">
                        {loading ? (
                            <p>Loading alumni data...</p>
                        ) : error ? (
                            <p style={{ color: 'red' }}>Error: {error}</p>
                        ) : filteredAlumni.length > 0 ? (
                            filteredAlumni.map(person => (
                                <div key={person.id} className="alumni-card">
                                    <h2>{person.Name}</h2>
                                    {person.Program && <p><strong>Program:</strong> {person.Program}</p>}
                                    {person.Year && <p><strong>Year:</strong> {person.Year}</p>}
                                    {person.Country && <p><strong>Country:</strong> {person.Country}</p>}
                                    {person.Nationality && <p><strong>Nationality:</strong> {person.Nationality}</p>}
                                    {person.Email && <p><strong>Email:</strong> {person.Email}</p>}
                                    {person.Role && <p><strong>Role:</strong> {person.Role}</p>}
                                    {person.CurrentPosition && <p><strong>Position:</strong> {person.CurrentPosition}</p>}
                                    {person.Institution && <p><strong>Institution:</strong> {person.Institution}</p>}
                                    {person.IsNITAGMember && <p><strong>NITAG Member:</strong> {person.IsNITAGMember}</p>}
                                    {person.Comments && <p><strong>Comments:</strong> {person.Comments}</p>}

                                    <button
                                        onClick={() => handleEditAlumnusClick(person)}
                                        className="edit-alumnus-button"
                                    >
                                        Edit
                                    </button>
                                </div>
                            ))
                        ) : (
                            <p>No alumni found matching your criteria.</p>
                        )}
                    </div>
                </div>

                <div className="sidebar">
                    <h2>Reports</h2>
                    {/* Chart 1: Attendees by Year */}
                    {attendeesByYear.length > 0 && uniquePrograms.length > 0 ? (
                        <div className="chart-card">
                            <h3>Attendees by Year</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={attendeesByYear} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="year" tickLine={false} axisLine={false} />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                                    <Legend />
                                    {chartProgramOrder.map(program => (
                                        <Bar
                                            key={program}
                                            dataKey={program}
                                            stackId="a"
                                            fill={programColors[program] || '#ccc'}
                                        />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <p className="no-data-message">No year data for charts.</p>
                    )}

                    {/* Chart 2: Top Countries by Attendees */}
                    {attendeesByCountry.length > 0 && uniquePrograms.length > 0 ? (
                        <div className="chart-card">
                            <h3>Top Countries</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={attendeesByCountry} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                                    <YAxis type="category" dataKey="country" tickLine={false} axisLine={false} width={80} />
                                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                                    <Legend />
                                    {chartProgramOrder.map(program => (
                                        <Bar
                                            key={program}
                                            dataKey={program}
                                            stackId="b"
                                            fill={programColors[program] || '#999'}
                                        />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <p className="no-data-message">No country data for charts.</p>
                    )}

                </div>
            </div>

            {showForm && (
                <AlumniForm
                    onClose={handleFormClose}
                    onSave={handleFormSave}
                    alumnusToEdit={alumnusToEdit}
                    uniquePrograms={uniquePrograms}
                />
            )}
        </div>
    );
}


// Wrap the App component with AuthProvider
function AppWithAuth() {
    return (
        <AuthProvider>
            <App />
        </AuthProvider>
    );
}

export default AppWithAuth;