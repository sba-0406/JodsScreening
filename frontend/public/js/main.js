// Main JS for shared interactions
document.addEventListener('DOMContentLoaded', () => {
    const currentPath = window.location.pathname;
    const userJson = localStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;

    // 1. Dynamic Navbar & Redirection Logic
    const navContainer = document.getElementById('nav-links') || document.querySelector('.navbar .container');

    if (navContainer) {
        let navHtml = '';

        if (user) {
            // Updated links: Remove ScenarioSim and Reports
            navHtml += `<a href="/api/applications/jobs-portal">Browse Jobs</a>`;
            navHtml += `<a href="/api/applications/my-dashboard">My Applications</a>`;
            navHtml += `<a href="#" id="logoutBtn">Logout</a>`;
        } else {
            // Not logged in - redirect from protected pages
            const protectedPaths = ['/api/assessment/assessment'];
            const isProtected = protectedPaths.some(p => currentPath.startsWith(p));

            if (isProtected) {
                console.warn('Unauthorized access to protected page. Redirecting to login.');
                window.location.href = '/login';
                return;
            }

            // Show Login if not on login/register page
            if (currentPath !== '/login' && currentPath !== '/register') {
                navHtml += `<a href="/login">Sign In</a>`;
            }
        }

        navContainer.innerHTML = navHtml;

        // Add User Identity Badge
        if (user && user.name) {
            const userBadge = document.createElement('span');
            userBadge.className = 'badge';
            userBadge.style.marginLeft = '20px';
            userBadge.style.padding = '4px 12px';
            userBadge.style.background = 'rgba(255,255,255,0.05)';
            userBadge.style.border = '1px solid rgba(255,255,255,0.1)';
            userBadge.style.borderRadius = '20px';
            userBadge.style.fontSize = '0.85em';
            userBadge.innerText = `${user.name} | ${user.role.toUpperCase()}`;
            navContainer.appendChild(userBadge);
        }
    }

    // 2. Logout Logic (Dynamically attached)
    document.addEventListener('click', async (e) => {
        if (e.target && e.target.id === 'logoutBtn') {
            e.preventDefault();
            try {
                await fetch('/api/auth/logout', { credentials: 'include' });
                localStorage.removeItem('user');
                window.location.href = '/login';
            } catch (err) {
                console.error('Logout failed:', err);
                localStorage.removeItem('user');
                window.location.href = '/login';
            }
        }
    });
});
