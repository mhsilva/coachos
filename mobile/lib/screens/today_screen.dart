import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/auth_provider.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../widgets/exercise_card.dart';

/// Screens: loading → empty → list → executing → feedback → finished
enum TodayView { loading, empty, list, executing, feedback, finished }

class TodayScreen extends StatefulWidget {
  const TodayScreen({super.key});

  @override
  State<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends State<TodayScreen> {
  TodayView _view = TodayView.loading;
  CoachInfo? _coach;
  List<PlanGroup> _planGroups = [];
  WorkoutDetail? _selected;
  List<LastSetLog> _lastLogs = [];
  final Set<String> _completedExercises = {};
  String? _sessionId;
  bool _sessionLoading = false;
  bool _finishing = false;
  String? _error;

  // Feedback
  String? _finishedSessionId;
  int _rating = 0;
  String _comment = '';
  bool _submittingFeedback = false;

  @override
  void initState() {
    super.initState();
    _loadWorkouts();
  }

  ApiClient get _api => context.read<AuthProvider>().api;

  Future<void> _loadWorkouts() async {
    try {
      final data = await _api.get('/workouts/mine') as Map<String, dynamic>;
      final coachJson = data['coach'] as Map<String, dynamic>?;
      final groups = (data['plan_groups'] as List)
          .map((g) => PlanGroup.fromJson(g as Map<String, dynamic>))
          .toList();

      setState(() {
        _coach = coachJson != null ? CoachInfo.fromJson(coachJson) : null;
        _planGroups = groups;
        _view = groups.any((g) => g.workouts.isNotEmpty)
            ? TodayView.list
            : TodayView.empty;
      });
    } catch (_) {
      setState(() => _view = TodayView.empty);
    }
  }

  Future<void> _selectWorkout(String workoutId) async {
    try {
      final detailJson =
          await _api.get('/workouts/mine/$workoutId') as Map<String, dynamic>;
      final logsJson =
          await _api.get('/sessions/last-logs/$workoutId') as List;

      setState(() {
        _selected = WorkoutDetail.fromJson(detailJson);
        _lastLogs = logsJson
            .map((l) => LastSetLog.fromJson(l as Map<String, dynamic>))
            .toList();
        _completedExercises.clear();
        _sessionId = null;
        _error = null;
        _view = TodayView.executing;
      });
    } catch (e) {
      setState(() => _error = 'Erro ao carregar treino.');
    }
  }

  Future<void> _startSession() async {
    if (_selected == null) return;
    setState(() => _sessionLoading = true);
    try {
      final res = await _api
          .post('/sessions/start', {'workout_id': _selected!.id});
      setState(
          () => _sessionId = (res as Map<String, dynamic>)['id'] as String);
    } finally {
      setState(() => _sessionLoading = false);
    }
  }

  Future<void> _logSet(
    String exerciseId,
    int setNumber,
    double? weightKg,
    int? repsDone,
  ) async {
    if (_sessionId == null) return;
    await _api.post('/sessions/$_sessionId/log', {
      'exercise_id': exerciseId,
      'set_number': setNumber,
      'weight_kg': weightKg,
      'reps_done': repsDone,
    });
  }

  Future<void> _finishSession() async {
    if (_sessionId == null) return;
    setState(() => _finishing = true);
    try {
      final sid = _sessionId!;
      await _api.patch('/sessions/$sid/finish');
      setState(() {
        _finishedSessionId = sid;
        _sessionId = null;
        _rating = 0;
        _comment = '';
        _error = null;
        _view = TodayView.feedback;
      });
    } catch (_) {
      setState(() => _error = 'Erro ao finalizar treino. Tente novamente.');
    } finally {
      setState(() => _finishing = false);
    }
  }

  Future<void> _submitFeedback() async {
    if (_finishedSessionId == null || _rating == 0) return;
    setState(() => _submittingFeedback = true);
    try {
      await _api.post('/sessions/$_finishedSessionId/feedback', {
        'rating': _rating,
        'comment': _comment.trim().isEmpty ? null : _comment.trim(),
      });
      setState(() => _view = TodayView.finished);
    } catch (_) {
      setState(() => _error = 'Erro ao enviar feedback.');
    } finally {
      setState(() => _submittingFeedback = false);
    }
  }

  void _backToList() {
    setState(() {
      _selected = null;
      _completedExercises.clear();
      _finishedSessionId = null;
      _rating = 0;
      _comment = '';
      _error = null;
      _view = TodayView.loading;
    });
    _loadWorkouts();
  }

  bool get _allExercisesDone =>
      _selected != null &&
      _selected!.exercises.isNotEmpty &&
      _selected!.exercises.every((ex) => _completedExercises.contains(ex.id));

  @override
  Widget build(BuildContext context) {
    switch (_view) {
      case TodayView.loading:
        return const Center(
          child: CircularProgressIndicator(color: AppColors.copper),
        );

      case TodayView.empty:
        return _buildEmpty();

      case TodayView.list:
        return _buildList();

      case TodayView.executing:
        return _buildExecuting();

      case TodayView.feedback:
        return _buildFeedback();

      case TodayView.finished:
        return _buildFinished();
    }
  }

  Widget _buildEmpty() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Meus Treinos',
            style: Theme.of(context).textTheme.headlineMedium),
        if (_coach != null) ...[
          const SizedBox(height: 16),
          _CoachCard(coach: _coach!),
        ],
        const SizedBox(height: 60),
        Center(
          child: Column(
            children: [
              const Text('📋', style: TextStyle(fontSize: 40)),
              const SizedBox(height: 12),
              Text('Nenhum treino disponível',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 4),
              Text(
                'Seu coach ainda não cadastrou treinos para você.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildList() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Meus Treinos',
            style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 2),
        Text('Escolha qual treino executar',
            style: Theme.of(context).textTheme.bodySmall),
        if (_coach != null) ...[
          const SizedBox(height: 12),
          _CoachCard(coach: _coach!),
        ],
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
        ],
        const SizedBox(height: 16),
        ..._planGroups.map((g) => _PlanCard(
              group: g,
              onSelect: _selectWorkout,
            )),
      ],
    );
  }

  Widget _buildExecuting() {
    if (_selected == null) return const SizedBox.shrink();
    final w = _selected!;
    final totalSets = w.exercises.fold(0, (sum, ex) => sum + ex.sets);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Back
        GestureDetector(
          onTap: _backToList,
          child: Row(
            children: [
              Icon(Icons.arrow_back, size: 18,
                  color: AppColors.teal.withAlpha(128)),
              const SizedBox(width: 4),
              Text('Voltar',
                  style: TextStyle(
                      fontSize: 14, color: AppColors.teal.withAlpha(128))),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Hero card
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: AppColors.teal,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(w.plan.name,
                  style: TextStyle(
                      fontSize: 12, color: Colors.white.withAlpha(128))),
              const SizedBox(height: 4),
              Text(
                w.name,
                style: GoogleFonts.syne(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  if (w.format != 'freeform') ...[
                    Text('${w.exercises.length} exercícios',
                        style: TextStyle(
                            fontSize: 14,
                            color: Colors.white.withAlpha(153))),
                    const SizedBox(width: 16),
                    Text('$totalSets séries',
                        style: GoogleFonts.jetBrainsMono(
                            fontSize: 14,
                            color: Colors.white.withAlpha(153))),
                  ],
                  if (w.format == 'freeform')
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.white.withAlpha(51),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Text('Treino livre',
                          style: TextStyle(fontSize: 12, color: Colors.white)),
                    ),
                ],
              ),
              const SizedBox(height: 14),
              if (_sessionId != null)
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: Colors.greenAccent,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text('Treino iniciado',
                        style: TextStyle(
                            fontSize: 14,
                            color: Colors.white.withAlpha(178))),
                  ],
                )
              else
                ElevatedButton(
                  onPressed: _sessionLoading ? null : _startSession,
                  child: Text(
                      _sessionLoading ? 'Iniciando...' : 'Iniciar treino'),
                ),
            ],
          ),
        ),

        // Plan notes
        if (w.plan.notes != null) ...[
          const SizedBox(height: 12),
          _NotesBlock(label: 'Observações da ficha', text: w.plan.notes!),
        ],

        // Workout notes
        if (w.notes != null) ...[
          const SizedBox(height: 12),
          _NotesBlock(label: 'Observações do treino', text: w.notes!),
        ],

        // Freeform content
        if (w.format == 'freeform' && w.content != null) ...[
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                w.content!,
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 14,
                  color: AppColors.teal.withAlpha(178),
                  height: 1.5,
                ),
              ),
            ),
          ),
        ],

        // Exercises
        if (w.format != 'freeform') ...[
          const SizedBox(height: 12),
          ...w.exercises.map((ex) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: ExerciseCardWidget(
                  exercise: ex,
                  lastLogs: _lastLogs,
                  onLogSet: _logSet,
                  onComplete: (id) =>
                      setState(() => _completedExercises.add(id)),
                ),
              )),
        ],

        // Finish button
        if (w.format == 'freeform' || _allExercisesDone) ...[
          const SizedBox(height: 16),
          if (_error != null) ...[
            Text(_error!,
                style: const TextStyle(color: Colors.red, fontSize: 13)),
            const SizedBox(height: 8),
          ],
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _finishing ? null : _finishSession,
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: Text(_finishing ? 'Finalizando...' : 'Finalizar Treino',
                  style: GoogleFonts.syne(
                      fontSize: 16, fontWeight: FontWeight.w700)),
            ),
          ),
        ],
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildFeedback() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const SizedBox(height: 24),
        const Center(
            child: Text('💪', style: TextStyle(fontSize: 48))),
        const SizedBox(height: 12),
        Center(
          child: Text('Treino finalizado!',
              style: Theme.of(context).textTheme.headlineLarge),
        ),
        Center(
          child: Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('Como foi essa sessão?',
                style: Theme.of(context).textTheme.bodySmall),
          ),
        ),
        const SizedBox(height: 20),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                // Stars
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: List.generate(5, (i) {
                    final n = i + 1;
                    return GestureDetector(
                      onTap: () => setState(() => _rating = n),
                      child: Icon(
                        Icons.star_rounded,
                        size: 40,
                        color: _rating >= n
                            ? AppColors.copper
                            : AppColors.teal.withAlpha(38),
                      ),
                    );
                  }),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Fácil demais',
                        style: TextStyle(
                            fontSize: 11,
                            color: AppColors.teal.withAlpha(115))),
                    Text('Intenso',
                        style: TextStyle(
                            fontSize: 11,
                            color: AppColors.teal.withAlpha(115))),
                  ],
                ),
                const SizedBox(height: 16),

                // Comment
                TextField(
                  maxLines: 5,
                  maxLength: 2000,
                  onChanged: (v) => _comment = v,
                  decoration: const InputDecoration(
                    hintText:
                        'Conte como foi: sentiu alguma dor, incômodo ou dificuldade?',
                  ),
                ),

                if (_error != null) ...[
                  const SizedBox(height: 8),
                  Text(_error!,
                      style:
                          const TextStyle(color: Colors.red, fontSize: 13)),
                ],

                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _rating == 0 || _submittingFeedback
                        ? null
                        : _submitFeedback,
                    child: Text(_submittingFeedback
                        ? 'Enviando...'
                        : 'Enviar feedback'),
                  ),
                ),
                TextButton(
                  onPressed: _submittingFeedback
                      ? null
                      : () => setState(() => _view = TodayView.finished),
                  child: Text('Pular',
                      style: TextStyle(color: AppColors.teal.withAlpha(128))),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildFinished() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('💪', style: TextStyle(fontSize: 48)),
          const SizedBox(height: 16),
          Text('Treino finalizado!',
              style: Theme.of(context).textTheme.headlineLarge),
          const SizedBox(height: 4),
          Text('Ótimo trabalho. Continue assim.',
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: _backToList,
            child: const Text('Voltar aos treinos'),
          ),
        ],
      ),
    );
  }
}

// ─── Helper widgets ─────────────────────────────────────

class _CoachCard extends StatelessWidget {
  final CoachInfo coach;
  const _CoachCard({required this.coach});

  @override
  Widget build(BuildContext context) {
    final name = coach.fullName ?? 'Seu coach';
    final initials = name
        .split(' ')
        .where((p) => p.isNotEmpty)
        .take(2)
        .map((p) => p[0])
        .join()
        .toUpperCase();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: AppColors.teal,
              foregroundColor: Colors.white,
              child: Text(initials.isEmpty ? 'C' : initials,
                  style: GoogleFonts.syne(
                      fontSize: 14, fontWeight: FontWeight.w700)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('SEU COACH',
                      style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w500,
                          color: AppColors.copper,
                          letterSpacing: 1)),
                  Text(name,
                      style: Theme.of(context).textTheme.titleMedium,
                      overflow: TextOverflow.ellipsis),
                  if (coach.bio != null)
                    Text(coach.bio!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  final PlanGroup group;
  final ValueChanged<String> onSelect;
  const _PlanCard({required this.group, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Card(
        clipBehavior: Clip.hardEdge,
        child: Column(
          children: [
            // Plan header
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.teal.withAlpha(8),
                border: Border(
                  bottom: BorderSide(color: AppColors.teal.withAlpha(18)),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 4,
                    height: 16,
                    decoration: BoxDecoration(
                      color: AppColors.copper,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(group.plan.name,
                        style: Theme.of(context).textTheme.titleLarge,
                        overflow: TextOverflow.ellipsis),
                  ),
                ],
              ),
            ),

            // Workouts
            if (group.workouts.isEmpty)
              Padding(
                padding: const EdgeInsets.all(14),
                child: Text('Nenhum treino nesta ficha.',
                    style: Theme.of(context).textTheme.bodySmall),
              )
            else
              ...group.workouts.map((w) => InkWell(
                    onTap: () => onSelect(w.id),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(w.name,
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleMedium),
                                const SizedBox(height: 3),
                                Row(
                                  children: [
                                    Text('${w.timesExecuted}x',
                                        style: Theme.of(context)
                                            .textTheme
                                            .labelSmall),
                                    if (w.estimatedDurationMin != null) ...[
                                      Text(' · ',
                                          style: TextStyle(
                                              color: AppColors.teal
                                                  .withAlpha(51))),
                                      Text('~${w.estimatedDurationMin} min',
                                          style: Theme.of(context)
                                              .textTheme
                                              .bodySmall),
                                    ],
                                  ],
                                ),
                              ],
                            ),
                          ),
                          Icon(Icons.chevron_right,
                              color: AppColors.teal.withAlpha(64), size: 20),
                        ],
                      ),
                    ),
                  )),
          ],
        ),
      ),
    );
  }
}

class _NotesBlock extends StatelessWidget {
  final String label;
  final String text;
  const _NotesBlock({required this.label, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.teal.withAlpha(10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.teal.withAlpha(15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w500,
                  color: AppColors.teal.withAlpha(102),
                  letterSpacing: 1)),
          const SizedBox(height: 4),
          Text(text,
              style: TextStyle(
                  fontSize: 14,
                  color: AppColors.teal.withAlpha(178),
                  height: 1.5)),
        ],
      ),
    );
  }
}
