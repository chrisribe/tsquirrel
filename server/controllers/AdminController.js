// AdminController.js
// Handles admin-specific operations for user management

class AdminController {
  constructor(userDAO) {
    this.userDAO = userDAO;
  }

  async getDashboard(req, res, next) {
    try {
      const usersWithAssets = await this.userDAO.getUsersWithAssetCounts();
      
      res.respondWithTemplateOrJson({ 
        users: usersWithAssets,
        currentUser: req.session.user 
      }, 'admin/dashboard-page');
    } catch (err) {
      console.error('Admin dashboard error:', err);
      res.status(500).respondWithTemplateOrJson({ 
        error: 'Failed to load admin dashboard' 
      }, 'errors/server-error');
      next(err);
    }
  }

  async updateUserStatus(req, res, next) {
    const { userId, status } = req.body;
    
    try {
      // Validate input
      if (!userId || !status) {
        return res.status(400).respondWithTemplateOrJson({ 
          error: 'User ID and status are required' 
        });
      }

      // Prevent self-modification
      if (parseInt(userId) === req.session.user.id) {
        return res.status(400).respondWithTemplateOrJson({ 
          error: 'Cannot modify your own account status' 
        });
      }

      await this.userDAO.updateUserStatus(userId, status);
      
      res.status(200).respondWithTemplateOrJson({ 
        message: `User status updated to ${status}`,
        success: true 
      });
    } catch (err) {
      console.error('Update user status error:', err);
      res.status(500).respondWithTemplateOrJson({ 
        error: 'Failed to update user status' 
      });
      next(err);
    }
  }

  async deleteUser(req, res, next) {
    const { id } = req.params;
    
    try {
      // Prevent self-deletion
      if (parseInt(id) === req.session.user.id) {
        return res.status(400).respondWithTemplateOrJson({ 
          error: 'Cannot delete your own account' 
        });
      }

      // Soft delete by setting status to 'deleted'
      await this.userDAO.updateUserStatus(id, 'deleted');
      
      res.status(200).respondWithTemplateOrJson({ 
        message: 'User deleted successfully',
        success: true 
      });
    } catch (err) {
      console.error('Delete user error:', err);
      res.status(500).respondWithTemplateOrJson({ 
        error: 'Failed to delete user' 
      });
      next(err);
    }
  }

  async getUserDetails(req, res, next) {
    const { id } = req.params;
    
    try {
      const user = await this.userDAO.getUserById(id);
      if (!user) {
        return res.status(404).respondWithTemplateOrJson({ 
          error: 'User not found' 
        });
      }

      const assetCounts = await this.userDAO.getUserAssetCounts(id);
      
      res.respondWithTemplateOrJson({ 
        user: { ...user, ...assetCounts } 
      });
    } catch (err) {
      console.error('Get user details error:', err);
      res.status(500).respondWithTemplateOrJson({ 
        error: 'Failed to get user details' 
      });
      next(err);
    }
  }
}

module.exports = AdminController;