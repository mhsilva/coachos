import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'api_client.dart';

/// Auth state exposed to the widget tree via Provider.
class AuthProvider extends ChangeNotifier {
  Session? _session;
  String? _role;
  bool _loading = true;

  Session? get session => _session;
  String? get role => _role;
  bool get loading => _loading;
  bool get isAuthenticated => _session != null;
  String get accessToken => _session?.accessToken ?? '';

  ApiClient get api => ApiClient(accessToken);

  AuthProvider() {
    _init();
  }

  void _init() {
    final supabase = Supabase.instance.client;

    // Current session
    _session = supabase.auth.currentSession;
    _role = _extractRole(_session);
    _loading = false;
    notifyListeners();

    // Listen for auth state changes
    supabase.auth.onAuthStateChange.listen((data) {
      _session = data.session;
      _role = _extractRole(data.session);
      notifyListeners();
    });
  }

  String? _extractRole(Session? s) {
    if (s == null) return null;
    final meta = s.user.appMetadata;
    return meta['role'] as String?;
  }

  Future<void> signIn(String email, String password) async {
    final res = await Supabase.instance.client.auth.signInWithPassword(
      email: email,
      password: password,
    );
    _session = res.session;
    _role = _extractRole(res.session);
    notifyListeners();
  }

  Future<void> signUp(String email, String password, String fullName) async {
    await Supabase.instance.client.auth.signUp(
      email: email,
      password: password,
      data: {'full_name': fullName, 'role': 'student'},
    );
  }

  Future<void> signOut() async {
    await Supabase.instance.client.auth.signOut();
    _session = null;
    _role = null;
    notifyListeners();
  }
}
