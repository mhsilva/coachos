import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../core/theme.dart';
import '../models/models.dart';
import 'rest_timer.dart';

enum SetStatus { pending, active, done }

class SetState {
  SetStatus status;
  String weight;
  String reps;

  SetState({required this.status, this.weight = '', this.reps = ''});
}

typedef OnLogSet = Future<void> Function(
  String exerciseId,
  int setNumber,
  double? weightKg,
  int? repsDone,
);

class ExerciseCardWidget extends StatefulWidget {
  final Exercise exercise;
  final List<LastSetLog> lastLogs;
  final OnLogSet onLogSet;
  final ValueChanged<String> onComplete;

  const ExerciseCardWidget({
    super.key,
    required this.exercise,
    required this.lastLogs,
    required this.onLogSet,
    required this.onComplete,
  });

  @override
  State<ExerciseCardWidget> createState() => _ExerciseCardWidgetState();
}

class _ExerciseCardWidgetState extends State<ExerciseCardWidget> {
  late List<SetState> _sets;
  int _activeIdx = 0;
  bool _logging = false;
  bool _showTimer = false;

  final _weightCtrl = TextEditingController();
  final _repsCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _sets = List.generate(widget.exercise.sets, (i) {
      final log = widget.lastLogs
          .where((l) =>
              l.exerciseId == widget.exercise.id && l.setNumber == i + 1)
          .firstOrNull;
      return SetState(
        status: i == 0 ? SetStatus.active : SetStatus.pending,
        weight: log?.weightKg?.toString() ?? '',
        reps: log?.repsDone?.toString() ?? '',
      );
    });
    _syncControllers();
  }

  void _syncControllers() {
    if (_activeIdx < _sets.length) {
      _weightCtrl.text = _sets[_activeIdx].weight;
      _repsCtrl.text = _sets[_activeIdx].reps;
    }
  }

  bool get _allDone => _sets.every((s) => s.status == SetStatus.done);

  bool get _hasHistory =>
      widget.lastLogs.any((l) => l.exerciseId == widget.exercise.id);

  void _activateSet(int idx) {
    if (_sets[idx].status == SetStatus.done) return;
    setState(() {
      for (var i = 0; i < _sets.length; i++) {
        if (i == idx) {
          _sets[i].status = SetStatus.active;
        } else if (_sets[i].status == SetStatus.active) {
          _sets[i].status = SetStatus.pending;
        }
      }
      _activeIdx = idx;
      _syncControllers();
    });
  }

  Future<void> _handleConfirm() async {
    setState(() => _logging = true);
    try {
      // Save controller values
      _sets[_activeIdx].weight = _weightCtrl.text;
      _sets[_activeIdx].reps = _repsCtrl.text;

      final w = double.tryParse(_weightCtrl.text);
      final r = int.tryParse(_repsCtrl.text);

      await widget.onLogSet(widget.exercise.id, _activeIdx + 1, w, r);

      setState(() {
        _sets[_activeIdx].status = SetStatus.done;
        final nextIdx = _activeIdx + 1;
        if (nextIdx < _sets.length) {
          final next = _sets[nextIdx];
          next.status = SetStatus.active;
          if (next.weight.isEmpty) next.weight = _weightCtrl.text;
          if (next.reps.isEmpty) next.reps = _repsCtrl.text;
          _activeIdx = nextIdx;
          _syncControllers();
          if ((widget.exercise.restSeconds ?? 0) > 0) {
            _showTimer = true;
          }
        } else {
          widget.onComplete(widget.exercise.id);
        }
      });
    } finally {
      setState(() => _logging = false);
    }
  }

  @override
  void dispose() {
    _weightCtrl.dispose();
    _repsCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ex = widget.exercise;
    final repsLabel = ex.repsMax != null
        ? '${ex.repsMin}–${ex.repsMax} reps'
        : '${ex.repsMin} reps';

    return Stack(
      children: [
        AnimatedOpacity(
          opacity: _allDone ? 0.6 : 1.0,
          duration: const Duration(milliseconds: 300),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(ex.name,
                                style: Theme.of(context).textTheme.titleLarge),
                            const SizedBox(height: 2),
                            Text(
                              '${ex.sets} séries · $repsLabel'
                              '${ex.restSeconds != null ? " · ${ex.restSeconds}s descanso" : ""}',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            if (_hasHistory && !_allDone) ...[
                              const SizedBox(height: 2),
                              Text(
                                'Valores do último treino',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: AppColors.copper.withAlpha(153),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      if (_allDone)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppColors.teal.withAlpha(26),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            'Concluído',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: AppColors.teal,
                            ),
                          ),
                        ),
                    ],
                  ),

                  // Notes
                  if (ex.notes != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppColors.teal.withAlpha(10),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        ex.notes!,
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.teal.withAlpha(140),
                          height: 1.5,
                        ),
                      ),
                    ),
                  ],

                  // Warmup
                  if (ex.warmupType != null) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 8),
                      decoration: BoxDecoration(
                        color: AppColors.teal.withAlpha(10),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          Text(
                            ex.warmupType == 'aquecimento'
                                ? 'Aquecimento'
                                : 'Reconhecimento',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: AppColors.teal.withAlpha(153),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '${ex.warmupSets}×${ex.warmupReps} reps',
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 12,
                              color: AppColors.teal.withAlpha(153),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],

                  // Set bubbles
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: List.generate(_sets.length, (i) {
                      final s = _sets[i];
                      Color bg;
                      Color fg;
                      switch (s.status) {
                        case SetStatus.done:
                          bg = AppColors.teal;
                          fg = Colors.white;
                          break;
                        case SetStatus.active:
                          bg = AppColors.copper;
                          fg = Colors.white;
                          break;
                        case SetStatus.pending:
                          bg = AppColors.teal.withAlpha(20);
                          fg = AppColors.teal.withAlpha(128);
                          break;
                      }
                      return GestureDetector(
                        onTap: () => _activateSet(i),
                        child: Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: bg,
                            borderRadius: BorderRadius.circular(9),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            '${i + 1}',
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: fg,
                            ),
                          ),
                        ),
                      );
                    }),
                  ),

                  // Log input
                  if (!_allDone &&
                      _activeIdx < _sets.length &&
                      _sets[_activeIdx].status == SetStatus.active) ...[
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _weightCtrl,
                            keyboardType: const TextInputType.numberWithOptions(
                                decimal: true),
                            decoration: InputDecoration(
                              hintText: 'Peso (kg)',
                              isDense: true,
                              contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 10),
                              hintStyle: GoogleFonts.jetBrainsMono(
                                fontSize: 13,
                                color: AppColors.teal.withAlpha(64),
                              ),
                            ),
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 14,
                              color: AppColors.teal,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: TextField(
                            controller: _repsCtrl,
                            keyboardType: TextInputType.number,
                            decoration: InputDecoration(
                              hintText: 'Reps',
                              isDense: true,
                              contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 10),
                              hintStyle: GoogleFonts.jetBrainsMono(
                                fontSize: 13,
                                color: AppColors.teal.withAlpha(64),
                              ),
                            ),
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 14,
                              color: AppColors.teal,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        SizedBox(
                          height: 40,
                          child: ElevatedButton(
                            onPressed: _logging ? null : _handleConfirm,
                            style: ElevatedButton.styleFrom(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 16),
                            ),
                            child: _logging
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Text('OK'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),

        // Rest timer overlay
        if (_showTimer && widget.exercise.restSeconds != null)
          Positioned.fill(
            child: RestTimerModal(
              seconds: widget.exercise.restSeconds!,
              onClose: () => setState(() => _showTimer = false),
            ),
          ),
      ],
    );
  }
}
