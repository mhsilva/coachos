import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'core/auth_provider.dart';
import 'core/env.dart';
import 'core/theme.dart';
import 'screens/login_screen.dart';
import 'screens/today_screen.dart';
import 'screens/history_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/notifications_screen.dart';
import 'screens/chat_screen.dart';
import 'screens/assessment_screen.dart';
import 'widgets/bottom_nav.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url: Env.supabaseUrl,
    anonKey: Env.supabaseAnonKey,
  );

  runApp(
    ChangeNotifierProvider(
      create: (_) => AuthProvider(),
      child: const CoachOSApp(),
    ),
  );
}

class CoachOSApp extends StatelessWidget {
  const CoachOSApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CoachOS',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      home: Consumer<AuthProvider>(
        builder: (_, auth, __) {
          if (auth.loading) {
            return const Scaffold(
              body: Center(
                child: CircularProgressIndicator(color: AppColors.copper),
              ),
            );
          }

          if (!auth.isAuthenticated || auth.role != 'student') {
            return const LoginScreen();
          }

          return const HomeShell();
        },
      ),
      // Deep-link routes for push notifications
      onGenerateRoute: (settings) {
        final uri = Uri.tryParse(settings.name ?? '');
        if (uri != null && uri.pathSegments.length >= 2) {
          if (uri.pathSegments[0] == 'chat') {
            return MaterialPageRoute(
              builder: (_) => ChatScreen(chatId: uri.pathSegments[1]),
            );
          }
          if (uri.pathSegments[0] == 'assessment') {
            return MaterialPageRoute(
              builder: (_) =>
                  AssessmentScreen(assessmentId: uri.pathSegments[1]),
            );
          }
        }
        return null;
      },
    );
  }
}

/// Main shell with bottom navigation tabs.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tabIndex = 0;
  int _unreadCount = 0;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _pollUnread();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _pollUnread(),
    );
  }

  Future<void> _pollUnread() async {
    try {
      final data = await context.read<AuthProvider>().api.get(
            '/notifications/unread-count',
          ) as Map<String, dynamic>;
      final count = data['count'] as int? ?? 0;
      if (mounted && count != _unreadCount) {
        setState(() => _unreadCount = count);
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: IndexedStack(
          index: _tabIndex,
          children: [
            const TodayScreen(),
            const HistoryScreen(),
            const ProfileScreen(),
            NotificationsScreen(onRefreshCount: _pollUnread),
          ],
        ),
      ),
      bottomNavigationBar: AppBottomNav(
        currentIndex: _tabIndex,
        onTap: (i) => setState(() => _tabIndex = i),
        unreadCount: _unreadCount,
      ),
    );
  }
}
