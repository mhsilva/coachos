import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/auth_provider.dart';
import '../core/theme.dart';
import '../models/models.dart';
import 'chat_screen.dart';
import 'assessment_screen.dart';

class NotificationsScreen extends StatefulWidget {
  final VoidCallback? onRefreshCount;
  const NotificationsScreen({super.key, this.onRefreshCount});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<AppNotification> _notifications = [];
  bool _loading = true;
  String? _respondingId;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data =
          await context.read<AuthProvider>().api.get('/notifications') as List;
      setState(() {
        _notifications = data
            .map((n) =>
                AppNotification.fromJson(n as Map<String, dynamic>))
            .toList();
      });
    } catch (_) {}
    setState(() => _loading = false);
  }

  Future<void> _markRead(String id) async {
    await context.read<AuthProvider>().api.patch('/notifications/read', {
      'notification_ids': [id],
    });
    setState(() {
      _notifications
          .firstWhere((n) => n.id == id)
          .isRead = true;
    });
    widget.onRefreshCount?.call();
  }

  Future<void> _markAllRead() async {
    await context
        .read<AuthProvider>()
        .api
        .patch('/notifications/read', {'all': true});
    setState(() {
      for (final n in _notifications) {
        n.isRead = true;
      }
    });
    widget.onRefreshCount?.call();
  }

  Future<void> _respond(
      String inviteId, String action, String notificationId) async {
    setState(() {
      _respondingId = notificationId;
      _error = null;
    });
    try {
      final api = context.read<AuthProvider>().api;
      await api
          .post('/auth/respond-invite', {'invite_id': inviteId, 'action': action});
      await api.patch('/notifications/read', {
        'notification_ids': [notificationId],
      });
      setState(() {
        final n = _notifications.firstWhere((n) => n.id == notificationId);
        n.isRead = true;
        n.type =
            action == 'accept' ? 'invite_accepted_by_me' : 'invite_rejected_by_me';
      });
      widget.onRefreshCount?.call();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _respondingId = null);
    }
  }

  void _openAnamnese(AppNotification n) async {
    final chatId = n.payload['chat_id'] as String?;
    if (chatId == null) return;
    await _markRead(n.id);
    if (!mounted) return;
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => ChatScreen(chatId: chatId)),
    );
  }

  void _openAssessment(AppNotification n) async {
    final assessmentId = n.payload['assessment_id'] as String?;
    if (assessmentId == null) return;
    await _markRead(n.id);
    if (!mounted) return;
    Navigator.of(context).push(
      MaterialPageRoute(
          builder: (_) => AssessmentScreen(assessmentId: assessmentId)),
    );
  }

  String _timeAgo(String iso) {
    final diff = DateTime.now().difference(DateTime.parse(iso));
    if (diff.inMinutes < 1) return 'agora';
    if (diff.inMinutes < 60) return '${diff.inMinutes}min';
    if (diff.inHours < 24) return '${diff.inHours}h';
    return '${diff.inDays}d';
  }

  @override
  Widget build(BuildContext context) {
    final hasUnread = _notifications.any((n) => !n.isRead);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Notificações',
                style: Theme.of(context).textTheme.headlineMedium),
            if (hasUnread)
              TextButton(
                onPressed: _markAllRead,
                child: const Text('Marcar todas como lidas',
                    style: TextStyle(fontSize: 12, color: AppColors.copper)),
              ),
          ],
        ),

        if (_error != null) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(9)),
            child: Text(_error!,
                style: TextStyle(fontSize: 13, color: Colors.red.shade700)),
          ),
        ],

        const SizedBox(height: 12),

        if (_loading)
          const Center(
            child: Padding(
              padding: EdgeInsets.only(top: 48),
              child: CircularProgressIndicator(color: AppColors.copper),
            ),
          )
        else if (_notifications.isEmpty)
          _buildEmpty()
        else
          ..._notifications.map(_buildNotificationCard),
      ],
    );
  }

  Widget _buildEmpty() {
    return Padding(
      padding: const EdgeInsets.only(top: 60),
      child: Column(
        children: [
          const Text('🔔', style: TextStyle(fontSize: 36)),
          const SizedBox(height: 12),
          Text('Nenhuma notificação',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text('Você está em dia!',
              style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }

  Widget _buildNotificationCard(AppNotification n) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: AnimatedOpacity(
        opacity: n.isRead ? 0.7 : 1.0,
        duration: const Duration(milliseconds: 200),
        child: Card(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(
              color: n.isRead
                  ? AppColors.teal.withAlpha(15)
                  : AppColors.copper.withAlpha(76),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (!n.isRead)
                      Container(
                        width: 8,
                        height: 8,
                        margin: const EdgeInsets.only(top: 5, right: 8),
                        decoration: BoxDecoration(
                          color: AppColors.copper,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(n.title,
                              style: Theme.of(context).textTheme.titleMedium,
                              overflow: TextOverflow.ellipsis),
                          const SizedBox(height: 2),
                          Text(n.body,
                              style: Theme.of(context).textTheme.bodySmall),
                        ],
                      ),
                    ),
                    Text(_timeAgo(n.createdAt),
                        style: TextStyle(
                            fontSize: 12,
                            color: AppColors.teal.withAlpha(76))),
                  ],
                ),

                // Invite actions
                if (n.type == 'invite_received' && !n.isRead) ...[
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton(
                          onPressed: _respondingId == n.id
                              ? null
                              : () => _respond(
                                  n.payload['invite_id'] as String,
                                  'accept',
                                  n.id),
                          child: Text(_respondingId == n.id ? '...' : 'Aceitar'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton(
                          onPressed: _respondingId == n.id
                              ? null
                              : () => _respond(
                                  n.payload['invite_id'] as String,
                                  'reject',
                                  n.id),
                          child: const Text('Recusar'),
                        ),
                      ),
                    ],
                  ),
                ],

                // Anamnese action
                if (n.type == 'anamnese_request') ...[
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () => _openAnamnese(n),
                      child: const Text('Responder'),
                    ),
                  ),
                ],

                // Assessment action
                if (n.type == 'assessment_requested') ...[
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () => _openAssessment(n),
                      child: const Text('Preencher avaliação'),
                    ),
                  ),
                ],

                // Response confirmations
                if (n.type == 'invite_accepted_by_me') ...[
                  const SizedBox(height: 8),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: AppColors.teal.withAlpha(26),
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: const Text('Convite aceito',
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: AppColors.teal)),
                  ),
                ],
                if (n.type == 'invite_rejected_by_me') ...[
                  const SizedBox(height: 8),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: AppColors.gray,
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: Text('Convite recusado',
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: AppColors.teal.withAlpha(128))),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
