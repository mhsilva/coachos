// All data models, mirroring the TypeScript interfaces from the frontend.

// ─── Workouts ───────────────────────────────────────────

class PlanInfo {
  final String id;
  final String name;
  final String? notes;
  final String? startDate;
  final String? endDate;
  final String scheduleType;

  PlanInfo.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        name = j['name'] as String,
        notes = j['notes'] as String?,
        startDate = j['start_date'] as String?,
        endDate = j['end_date'] as String?,
        scheduleType = j['schedule_type'] as String? ?? 'sequence';
}

class WorkoutEntry {
  final String id;
  final String name;
  final int? weekday;
  final int? sequencePosition;
  final int? estimatedDurationMin;
  final int timesExecuted;
  final String? lastExecutedAt;

  WorkoutEntry.fromJson(Map<String, dynamic> j)
      : id = (j['workout'] as Map<String, dynamic>)['id'] as String,
        name = (j['workout'] as Map<String, dynamic>)['name'] as String,
        weekday = (j['workout'] as Map<String, dynamic>)['weekday'] as int?,
        sequencePosition = (j['workout'] as Map<String, dynamic>)['sequence_position'] as int?,
        estimatedDurationMin = (j['workout'] as Map<String, dynamic>)['estimated_duration_min'] as int?,
        timesExecuted = j['times_executed'] as int? ?? 0,
        lastExecutedAt = j['last_executed_at'] as String?;
}

class PlanGroup {
  final PlanInfo plan;
  final List<WorkoutEntry> workouts;

  PlanGroup.fromJson(Map<String, dynamic> j)
      : plan = PlanInfo.fromJson(j['plan'] as Map<String, dynamic>),
        workouts = (j['workouts'] as List)
            .map((w) => WorkoutEntry.fromJson(w as Map<String, dynamic>))
            .toList();
}

class CoachInfo {
  final String? fullName;
  final String? avatarUrl;
  final String? bio;

  CoachInfo.fromJson(Map<String, dynamic> j)
      : fullName = j['full_name'] as String?,
        avatarUrl = j['avatar_url'] as String?,
        bio = j['bio'] as String?;
}

class Exercise {
  final String id;
  final String name;
  final int sets;
  final int repsMin;
  final int? repsMax;
  final int orderIndex;
  final String? demoUrl;
  final int? restSeconds;
  final String? warmupType;
  final int? warmupSets;
  final int? warmupReps;
  final String? notes;

  Exercise.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        name = j['name'] as String,
        sets = j['sets'] as int,
        repsMin = j['reps_min'] as int,
        repsMax = j['reps_max'] as int?,
        orderIndex = j['order_index'] as int? ?? 0,
        demoUrl = j['demo_url'] as String?,
        restSeconds = j['rest_seconds'] as int?,
        warmupType = j['warmup_type'] as String?,
        warmupSets = j['warmup_sets'] as int?,
        warmupReps = j['warmup_reps'] as int?,
        notes = j['notes'] as String?;
}

class WorkoutDetail {
  final PlanInfo plan;
  final String id;
  final String name;
  final String format;
  final String? content;
  final String? notes;
  final int? estimatedDurationMin;
  final List<Exercise> exercises;

  WorkoutDetail.fromJson(Map<String, dynamic> j)
      : plan = PlanInfo.fromJson(j['plan'] as Map<String, dynamic>),
        id = (j['workout'] as Map<String, dynamic>)['id'] as String,
        name = (j['workout'] as Map<String, dynamic>)['name'] as String,
        format = (j['workout'] as Map<String, dynamic>)['format'] as String? ?? 'structured',
        content = (j['workout'] as Map<String, dynamic>)['content'] as String?,
        notes = (j['workout'] as Map<String, dynamic>)['notes'] as String?,
        estimatedDurationMin = (j['workout'] as Map<String, dynamic>)['estimated_duration_min'] as int?,
        exercises = ((j['workout'] as Map<String, dynamic>)['exercises'] as List?)
                ?.map((e) => Exercise.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [];
}

class LastSetLog {
  final String exerciseId;
  final int setNumber;
  final double? weightKg;
  final int? repsDone;

  LastSetLog.fromJson(Map<String, dynamic> j)
      : exerciseId = j['exercise_id'] as String,
        setNumber = j['set_number'] as int,
        weightKg = (j['weight_kg'] as num?)?.toDouble(),
        repsDone = j['reps_done'] as int?;
}

// ─── Sessions ───────────────────────────────────────────

class SetLog {
  final String? exerciseId;
  final String? exerciseName;
  final int setNumber;
  final double? weightKg;
  final int? repsDone;

  SetLog.fromJson(Map<String, dynamic> j)
      : exerciseId = j['exercise_id'] as String?,
        exerciseName = j['exercise_name'] as String?,
        setNumber = j['set_number'] as int,
        weightKg = (j['weight_kg'] as num?)?.toDouble(),
        repsDone = j['reps_done'] as int?;
}

class WorkoutSession {
  final String id;
  final String startedAt;
  final String? finishedAt;
  final String? workoutId;
  final String? workoutName;
  final List<SetLog> setLogs;

  WorkoutSession.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        startedAt = j['started_at'] as String,
        finishedAt = j['finished_at'] as String?,
        workoutId = j['workout_id'] as String?,
        workoutName = j['workout_name'] as String? ??
            (j['workouts'] as Map<String, dynamic>?)?['name'] as String?,
        setLogs = (j['set_logs'] as List?)
                ?.map((l) => SetLog.fromJson(l as Map<String, dynamic>))
                .toList() ??
            [];
}

// ─── Chat ───────────────────────────────────────────────

class ChatMessage {
  final String role;
  String content;
  final String? at;

  ChatMessage({required this.role, required this.content, this.at});

  ChatMessage.fromJson(Map<String, dynamic> j)
      : role = j['role'] as String,
        content = j['content'] as String,
        at = j['at'] as String?;
}

class ChatMeta {
  final String id;
  final String type;
  String status;
  final String studentId;
  final String coachId;
  final String createdAt;
  final String? closedAt;
  final List<ChatMessage> messages;

  ChatMeta.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        type = j['type'] as String? ?? 'anamnese',
        status = j['status'] as String,
        studentId = j['student_id'] as String,
        coachId = j['coach_id'] as String,
        createdAt = j['created_at'] as String,
        closedAt = j['closed_at'] as String?,
        messages = (j['messages'] as List?)
                ?.map((m) => ChatMessage.fromJson(m as Map<String, dynamic>))
                .toList() ??
            [];
}

// ─── Notifications ──────────────────────────────────────

class AppNotification {
  final String id;
  String type;
  final String title;
  final String body;
  final Map<String, dynamic> payload;
  bool isRead;
  final String createdAt;

  AppNotification.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        type = j['type'] as String,
        title = j['title'] as String,
        body = j['body'] as String? ?? '',
        payload = (j['payload'] as Map<String, dynamic>?) ?? {},
        isRead = j['is_read'] as bool? ?? false,
        createdAt = j['created_at'] as String;
}

// ─── Student Profile ────────────────────────────────────

class StudentProfile {
  final String id;
  final String? birthDate;
  final double? weightKg;
  final String? email;
  final String? fullName;
  final String? avatarUrl;

  StudentProfile.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        birthDate = j['birth_date'] as String?,
        weightKg = (j['weight_kg'] as num?)?.toDouble(),
        email = j['email'] as String?,
        fullName =
            (j['profiles'] as Map<String, dynamic>?)?['full_name'] as String?,
        avatarUrl =
            (j['profiles'] as Map<String, dynamic>?)?['avatar_url'] as String?;
}
