const User = require('../models/User');
const { logAction } = require('../utils/auditLogger');

/**
 * @desc    Render Admin Dashboard
 * @route   GET /api/admin/dashboard
 * @access  Private (Admin)
 */
exports.renderAdminDashboard = async (req, res) => {
    try {
        const hrUsers = await User.find({ role: 'hr', status: 'active' }).sort({ createdAt: -1 });
        res.render('admin-dashboard', {
            user: req.user,
            hrUsers,
            title: 'Admin Dashboard'
        });
    } catch (error) {
        console.error('[ADMIN ERROR] renderAdminDashboard:', error);
        res.status(500).send('Server Error');
    }
};

/**
 * @desc    Create a new HR account
 * @route   POST /api/admin/hr
 * @access  Private (Admin)
 */
exports.createHR = async (req, res) => {
    try {
        const { name, email, password, company, department } = req.body;

        // Check if user already exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ success: false, error: 'User with this email already exists' });
        }

        const hr = await User.create({
            name,
            email,
            password,
            company,
            department,
            role: 'hr',
            status: 'active'
        });

        // Audit Log: creation
        await logAction({
            entityType: 'user',
            entityId: hr._id,
            action: 'create',
            req,
            metadata: { name: hr.name, email: hr.email, role: 'hr' }
        });

        res.status(201).json({
            success: true,
            message: 'HR account created successfully',
            data: { id: hr._id, name: hr.name, email: hr.email }
        });
    } catch (error) {
        if (error.name === 'ValidationError') {
            const message = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, error: message[0] });
        }
        console.error('[ADMIN ERROR] createHR:', error);
        res.status(500).json({ success: false, error: 'Failed to create HR account' });
    }
};

/**
 * @desc    Delete an HR account
 * @route   DELETE /api/admin/hr/:id
 * @access  Private (Admin)
 */
exports.deleteHR = async (req, res) => {
    try {
        const hr = await User.findById(req.params.id);

        if (!hr) {
            return res.status(404).json({ success: false, error: 'HR account not found' });
        }

        if (hr.role !== 'hr') {
            return res.status(400).json({ success: false, error: 'Cannot delete non-HR accounts via this endpoint' });
        }

        // Audit Log: suspension (Soft Delete)
        await logAction({
            entityType: 'user',
            entityId: hr._id,
            action: 'status_change',
            previousState: hr.status,
            newState: 'suspended',
            req,
            metadata: { name: hr.name, email: hr.email, role: 'hr', deleteTriggered: true }
        });

        hr.status = 'suspended';
        await hr.save();

        res.json({ success: true, message: 'HR account deleted successfully' });
    } catch (error) {
        console.error('[ADMIN ERROR] deleteHR:', error);
        res.status(500).json({ success: false, error: 'Failed to delete HR account' });
    }
};
