import 'package:flutter/material.dart';
import '../../data/repositories/auth_repository.dart';
import '../../data/models/user_model.dart';

class AuthProvider extends ChangeNotifier {
  final AuthRepository _authRepository = AuthRepository();

  UserModel? _currentUser;
  bool _isLoading = false;
  String? _errorMessage;

  // Getters
  UserModel? get currentUser => _currentUser;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;

  // Initialize auth state
  AuthProvider() {
    _initializeAuthState();
  }

  Future<void> _initializeAuthState() async {
    try {
      _isLoading = true;
      notifyListeners();

      final user = await _authRepository.getCurrentUser();
      if (user != null) {
        _currentUser = user;
      }
    } catch (e) {
      _errorMessage = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Register new user
  Future<bool> register({
    required String name,
    required String phone,
    required String password,
    required String role,
  }) async {
    try {
      _isLoading = true;
      _errorMessage = null;
      notifyListeners();

      final user = await _authRepository.register(
        name: name,
        phone: phone,
        password: password,
        role: role,
      );

      if (user != null) {
        _currentUser = user;
        return true;
      }
      return false;
    } catch (e) {
      _errorMessage = e.toString();
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Login with email/password
  Future<bool> login({required String phone, required String password}) async {
    try {
      _isLoading = true;
      _errorMessage = null;
      notifyListeners();

      final user = await _authRepository.login(
        phone: phone,
        password: password,
      );

      if (user != null) {
        _currentUser = user;
        return true;
      }
      return false;
    } catch (e) {
      _errorMessage = e.toString();
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Login with biometric
  Future<bool> loginWithBiometric() async {
    try {
      _isLoading = true;
      _errorMessage = null;
      notifyListeners();

      final user = await _authRepository.loginWithBiometric();

      if (user != null) {
        _currentUser = user;
        return true;
      }
      return false;
    } catch (e) {
      _errorMessage = e.toString();
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Update user profile
  Future<bool> updateProfile({String? name, String? phone}) async {
    try {
      if (_currentUser == null) return false;

      _isLoading = true;
      _errorMessage = null;
      notifyListeners();

      await _authRepository.updateProfile(
        userId: _currentUser!.userId,
        name: name,
        phone: phone,
      );

      // Update local user data
      _currentUser = _currentUser!.copyWith(
        name: name ?? _currentUser!.name,
        phone: phone ?? _currentUser!.phone,
      );

      return true;
    } catch (e) {
      _errorMessage = e.toString();
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Change password
  Future<bool> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    try {
      _isLoading = true;
      _errorMessage = null;
      notifyListeners();

      await _authRepository.changePassword(
        currentPassword: currentPassword,
        newPassword: newPassword,
      );

      return true;
    } catch (e) {
      _errorMessage = e.toString();
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Check if user exists
  Future<bool> checkUserExists(String phone) async {
    try {
      return await _authRepository.userExists(phone);
    } catch (e) {
      _errorMessage = e.toString();
      return false;
    }
  }

  // Login by phone (no password) — sets current user if found
  Future<bool> loginByPhone({required String name, required String phone}) async {
    try {
      _isLoading = true;
      _errorMessage = null;
      notifyListeners();

      final user = await _authRepository.getUserByPhone(phone);
      if (user != null) {
        _currentUser = user;
        return true;
      }
      return false;
    } catch (e) {
      _errorMessage = e.toString();
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Get all users (admin only)
  Future<List<UserModel>> getAllUsers() async {
    try {
      return await _authRepository.getAllUsers();
    } catch (e) {
      _errorMessage = e.toString();
      return [];
    }
  }

  // Delete user (admin only)
  Future<bool> deleteUser(String userId) async {
    try {
      await _authRepository.deleteUser(userId);
      if (userId == _currentUser?.userId) {
        _currentUser = null;
      }
      return true;
    } catch (e) {
      _errorMessage = e.toString();
      return false;
    }
  }

  // Logout
  Future<bool> logout() async {
    try {
      _isLoading = true;
      notifyListeners();

      await _authRepository.logout();
      _currentUser = null;

      return true;
    } catch (e) {
      _errorMessage = e.toString();
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Clear error message
  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  // Check if user is admin
  bool get isAdmin {
    return _currentUser?.role == 'admin';
  }

  // Update user data from Firestore
  Future<void> refreshUserData() async {
    try {
      if (_currentUser == null) return;
      final user = await _authRepository.getUserById(_currentUser!.userId);
      if (user != null) {
        _currentUser = user;
        notifyListeners();
      }
    } catch (e) {
      _errorMessage = e.toString();
    }
  }
}

// Extension for UserModel copyWith
extension UserModelCopyWith on UserModel {
  UserModel copyWith({
    String? userId,
    String? name,
    String? phone,
    String? role,
    DateTime? createdAt,
  }) {
    return UserModel(
      userId: userId ?? this.userId,
      name: name ?? this.name,
      phone: phone ?? this.phone,
      role: role ?? this.role,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}
