import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../core/auth_provider.dart';
import '../core/theme.dart';
import '../models/models.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  List<WorkoutSession> _sessions = [];
  bool _loading = true;
  String? _expandedId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await context.read<AuthProvider>().api.get('/sessions/mine');
      setState(() {
        _sessions = (data as List)
            .map((s) => WorkoutSession.fromJson(s as Map<String, dynamic>))
            .toList();
      });
    } catch (_) {}
    setState(() => _loading = false);
  }

  String _formatDate(String iso) {
    final d = DateTime.parse(iso);
    const months = [
      'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
      'jul', 'ago', 'set', 'out', 'nov', 'dez',
    ];
    return '${d.day.toString().padLeft(2, '0')} ${months[d.month - 1]} ${d.year}';
  }

  String? _formatDuration(String start, String? end) {
    if (end == null) return null;
    final mins = DateTime.parse(end).difference(DateTime.parse(start)).inMinutes;
    return '$mins min';
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Histórico', style: Theme.of(context).textTheme.headlineMedium),
        if (_sessions.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text('${_sessions.length} sessões finalizadas',
                style: Theme.of(context).textTheme.bodySmall),
          ),
        const SizedBox(height: 16),

        if (_loading)
          const Center(
            child: Padding(
              padding: EdgeInsets.only(top: 48),
              child: CircularProgressIndicator(color: AppColors.copper),
            ),
          )
        else if (_sessions.isEmpty)
          _buildEmpty()
        else
          ..._sessions.map(_buildSessionCard),
      ],
    );
  }

  Widget _buildEmpty() {
    return Padding(
      padding: const EdgeInsets.only(top: 60),
      child: Column(
        children: [
          const Text('📋', style: TextStyle(fontSize: 36)),
          const SizedBox(height: 12),
          Text('Nenhuma sessão registrada ainda',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text('Complete seu primeiro treino para ver o histórico aqui.',
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center),
        ],
      ),
    );
  }

  Widget _buildSessionCard(WorkoutSession s) {
    final isExpanded = _expandedId == s.id;
    final duration = _formatDuration(s.startedAt, s.finishedAt);

    // Group by exercise name
    final byExercise = <String, List<SetLog>>{};
    for (final log in s.setLogs) {
      final name = log.exerciseName ?? 'Exercício removido';
      byExercise.putIfAbsent(name, () => []).add(log);
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Card(
        clipBehavior: Clip.hardEdge,
        child: Column(
          children: [
            InkWell(
              onTap: () =>
                  setState(() => _expandedId = isExpanded ? null : s.id),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                s.workoutName ?? 'Treino removido',
                                style:
                                    Theme.of(context).textTheme.titleMedium,
                              ),
                              const SizedBox(height: 2),
                              Text(_formatDate(s.startedAt),
                                  style:
                                      Theme.of(context).textTheme.bodySmall),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppColors.teal.withAlpha(26),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Text('Concluído',
                              style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                  color: AppColors.teal)),
                        ),
                        const SizedBox(width: 6),
                        AnimatedRotation(
                          turns: isExpanded ? 0.5 : 0,
                          duration: const Duration(milliseconds: 200),
                          child: Icon(Icons.expand_more,
                              size: 20,
                              color: AppColors.teal.withAlpha(76)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Text('${s.setLogs.length} séries',
                            style: Theme.of(context).textTheme.labelSmall),
                        if (duration != null) ...[
                          const SizedBox(width: 12),
                          Text(duration,
                              style: Theme.of(context).textTheme.bodySmall),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ),

            // Expanded detail
            if (isExpanded && s.setLogs.isNotEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(color: AppColors.teal.withAlpha(15)),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: byExercise.entries.map((entry) {
                    final logs = entry.value
                      ..sort((a, b) => a.setNumber.compareTo(b.setNumber));
                    return Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(entry.key,
                              style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w500,
                                  color: AppColors.teal)),
                          const SizedBox(height: 6),
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: logs.map((log) {
                              final parts = <String>[];
                              if (log.weightKg != null) {
                                parts.add('${log.weightKg}kg');
                              }
                              if (log.repsDone != null) {
                                parts.add('${log.repsDone}');
                              }
                              return Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 5),
                                decoration: BoxDecoration(
                                  color: AppColors.surface,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text.rich(
                                  TextSpan(
                                    children: [
                                      TextSpan(
                                        text: 'S${log.setNumber} ',
                                        style: TextStyle(
                                            color:
                                                AppColors.teal.withAlpha(76)),
                                      ),
                                      TextSpan(
                                        text: parts.isEmpty
                                            ? '—'
                                            : parts.join(' × '),
                                      ),
                                    ],
                                  ),
                                  style: GoogleFonts.jetBrainsMono(
                                    fontSize: 12,
                                    color: AppColors.teal.withAlpha(178),
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
