import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/user_model.dart';
import '../../core/services/firebase_service.dart';

class AuthRepository {
  final FirebaseAuth _auth = FirebaseService.auth;
  final FirebaseFirestore _firestore = FirebaseService.firestore;

  // Register new user
  Future<UserModel?> register({
    required String name,
    required String phone,
    required String password,
    required String role,
  }) async {
    try {
      // Create user with email and password (using phone as email)
      final userCredential = await _auth.createUserWithEmailAndPassword(
        email: '$phone@attendance.com',
        password: password,
      );

      final user = userCredential.user;
      if (user == null) return null;

      // Create user data
      final userData = UserModel(
        userId: user.uid,
        name: name,
        phone: phone,
        role: role,
        createdAt: DateTime.now(),
      );

      // Update Firebase Auth profile (display name) when possible
      try {
        await user.updateDisplayName(name);
      } catch (_) {}

      // Save to Firestore (merge to be tolerant of partial writes)
      await _firestore
          .collection('users')
          .doc(user.uid)
          .set(userData.toMap(), SetOptions(merge: true));

      return userData;
    } catch (e) {
      throw _handleAuthError(e);
    }
  }

  // Login with email/password
  Future<UserModel?> login({
    required String phone,
    required String password,
  }) async {
    try {
      final userCredential = await _auth.signInWithEmailAndPassword(
        email: '$phone@attendance.com',
        password: password,
      );

      return await _getUserData(userCredential.user!.uid);
    } catch (e) {
      throw _handleAuthError(e);
    }
  }

  // Login with biometric
  Future<UserModel?> loginWithBiometric() async {
    try {
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        throw 'يجب تسجيل الدخول أولاً';
      }

      return await _getUserData(currentUser.uid);
    } catch (e) {
      throw e.toString();
    }
  }

  // Get current user data
  Future<UserModel?> getCurrentUser() async {
    try {
      final currentUser = _auth.currentUser;
      if (currentUser == null) return null;

      return await _getUserData(currentUser.uid);
    } catch (e) {
      throw e.toString();
    }
  }

  // Get user data from Firestore
  Future<UserModel?> _getUserData(String userId) async {
    try {
      final doc = await _firestore.collection('users').doc(userId).get();

      if (doc.exists) {
        return UserModel.fromMap(doc.data()!);
      }
      return null;
    } catch (e) {
      throw e.toString();
    }
  }

  // Public wrapper to get user by id
  Future<UserModel?> getUserById(String userId) async {
    return await _getUserData(userId);
  }

  // Update user profile
  Future<void> updateProfile({
    required String userId,
    String? name,
    String? phone,
  }) async {
    try {
      final updateData = <String, dynamic>{};
      if (name != null) updateData['name'] = name;
      if (phone != null) updateData['phone'] = phone;

      await _firestore.collection('users').doc(userId).update(updateData);

      // Update email if phone changed
      if (phone != null) {
        final user = _auth.currentUser;
        if (user != null) {
          try {
            await (user as dynamic).updateEmail('$phone@attendance.com');
          } catch (_) {
            // Some firebase_auth versions/platforms may require re-authentication
            // or may not expose updateEmail on the client. Ignore compatibility errors here.
          }
        }
      }
    } catch (e) {
      throw e.toString();
    }
  }

  // Change password
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    try {
      final user = _auth.currentUser;
      if (user == null) throw 'المستخدم غير موجود';

      // Re-authenticate user
      final credential = EmailAuthProvider.credential(
        email: user.email!,
        password: currentPassword,
      );

      await user.reauthenticateWithCredential(credential);
      await user.updatePassword(newPassword);
    } catch (e) {
      throw _handleAuthError(e);
    }
  }

  // Logout
  Future<void> logout() async {
    try {
      await _auth.signOut();
    } catch (e) {
      throw e.toString();
    }
  }

  // Check if user exists
  Future<bool> userExists(String phone) async {
    try {
      final query =
          await _firestore
              .collection('users')
              .where('phone', isEqualTo: phone)
              .limit(1)
              .get();

      return query.docs.isNotEmpty;
    } catch (e) {
      throw e.toString();
    }
  }

  // Get user by phone
  Future<UserModel?> getUserByPhone(String phone) async {
    try {
      final query = await _firestore
          .collection('users')
          .where('phone', isEqualTo: phone)
          .limit(1)
          .get();

      if (query.docs.isEmpty) return null;
      return UserModel.fromMap(query.docs.first.data());
    } catch (e) {
      throw e.toString();
    }
  }

  // Get all users (for admin)
  Future<List<UserModel>> getAllUsers() async {
    try {
      final query =
          await _firestore
              .collection('users')
              .orderBy('createdAt', descending: true)
              .get();

      return query.docs.map((doc) => UserModel.fromMap(doc.data())).toList();
    } catch (e) {
      throw e.toString();
    }
  }

  // Delete user (admin only)
  Future<void> deleteUser(String userId) async {
    try {
      // Delete user document from Firestore
      await _firestore.collection('users').doc(userId).delete();

      // Deleting a Firebase Auth user from client side is only possible
      // for the currently authenticated user. Only delete from Auth
      // if the target user matches the current user.
      final currentUid = _auth.currentUser?.uid;
      if (currentUid != null && currentUid == userId) {
        await _auth.currentUser?.delete();
      }
    } catch (e) {
      throw e.toString();
    }
  }

  // Handle auth errors
  String _handleAuthError(dynamic error) {
    if (error is FirebaseAuthException) {
      switch (error.code) {
        case 'email-already-in-use':
          return 'البريد الإلكتروني مستخدم بالفعل';
        case 'invalid-email':
          return 'البريد الإلكتروني غير صحيح';
        case 'operation-not-allowed':
          return 'عملية غير مسموحة';
        case 'weak-password':
          return 'كلمة المرور ضعيفة';
        case 'user-disabled':
          return 'الحساب معطل';
        case 'user-not-found':
          return 'المستخدم غير موجود';
        case 'wrong-password':
          return 'كلمة المرور غير صحيحة';
        case 'too-many-requests':
          return 'محاولات كثيرة، حاول لاحقاً';
        default:
          return 'حدث خطأ: ${error.message}';
      }
    }
    return error.toString();
  }
}
