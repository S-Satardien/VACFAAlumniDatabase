export const MASTER_ADMINS = [
  "gemini@coding.com",
  "saleem.satardien@uct.ac.za",
  "alana.keyser@uct.ac.za",
  "edina.amponsah-dacosta@uct.ac.za",
  "hilary.basson@uct.ac.za"
];

export function isUserAdmin(userEmail, userAssignedCohorts = []) {
  if (!userEmail) return false;
  const emailLower = userEmail.toLowerCase().trim();
  if (MASTER_ADMINS.includes(emailLower)) return true;
  if (userAssignedCohorts.some(c => String(c).toUpperCase() === 'ALL')) return true;
  return false;
}
