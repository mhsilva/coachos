import 'dart:io';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'api_client.dart';

/// Handles FCM registration, token management, and notification display.
class PushNotificationService {
  static final _messaging = FirebaseMessaging.instance;
  static final _localNotifications = FlutterLocalNotificationsPlugin();
  static String? _currentToken;

  /// Call once after login. Requests permission, gets token, registers with backend.
  static Future<void> init(ApiClient api) async {
    // Request permission (iOS shows dialog, Android auto-grants)
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      debugPrint('Push notifications denied by user');
      return;
    }

    // Get FCM token
    final token = await _messaging.getToken();
    if (token != null) {
      _currentToken = token;
      await _registerToken(api, token);
    }

    // Listen for token refresh
    _messaging.onTokenRefresh.listen((newToken) {
      _currentToken = newToken;
      _registerToken(api, newToken);
    });

    // Setup local notifications for foreground display
    await _setupLocalNotifications();

    // Handle foreground messages
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // Handle notification tap when app is in background
    FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);

    // Handle notification tap when app was terminated
    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) {
      _handleNotificationTap(initialMessage);
    }
  }

  /// Register the FCM token with the backend so it can send pushes.
  static Future<void> _registerToken(ApiClient api, String token) async {
    try {
      await api.post('/notifications/register-device', {
        'token': token,
        'platform': Platform.isIOS ? 'ios' : 'android',
      });
      debugPrint('FCM token registered with backend');
    } catch (e) {
      debugPrint('Failed to register FCM token: $e');
    }
  }

  /// Unregister token on logout.
  static Future<void> unregister(ApiClient api) async {
    if (_currentToken == null) return;
    try {
      await api.post('/notifications/unregister-device', {
        'token': _currentToken,
      });
    } catch (_) {}
    _currentToken = null;
  }

  static Future<void> _setupLocalNotifications() async {
    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );
    await _localNotifications.initialize(
      settings: initSettings,
      onDidReceiveNotificationResponse: (_) {},
    );
  }

  static void _handleForegroundMessage(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null) return;

    _localNotifications.show(
      id: notification.hashCode,
      title: notification.title,
      body: notification.body,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          'coachos_channel',
          'CoachOS',
          channelDescription: 'Notificações do CoachOS',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
    );
  }

  static void _handleNotificationTap(RemoteMessage message) {
    // The payload can contain routing info (chat_id, assessment_id, etc.)
    // Navigation is handled by the app's main navigator via deep links.
    final data = message.data;
    debugPrint('Notification tapped: $data');
    // TODO: Navigate based on data['type'], data['chat_id'], etc.
    // This requires a global navigator key, which can be added later.
  }
}

/// Top-level handler for background messages (runs in isolate).
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Firebase is already initialized by the time this runs.
  debugPrint('Background message: ${message.notification?.title}');
}
