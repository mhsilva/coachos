import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/auth_provider.dart';
import '../core/theme.dart';
import '../models/models.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  StudentProfile? _data;
  final _birthCtrl = TextEditingController();
  final _weightCtrl = TextEditingController();
  bool _saving = false;
  bool _saveSuccess = false;
  bool _coachRequested = false;
  bool _requestLoading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await context.read<AuthProvider>().api.get('/students/me')
          as Map<String, dynamic>;
      final profile = StudentProfile.fromJson(data);
      setState(() {
        _data = profile;
        _birthCtrl.text = profile.birthDate ?? '';
        _weightCtrl.text =
            profile.weightKg != null ? profile.weightKg.toString() : '';
      });
    } catch (_) {}
  }

  bool get _hasChanges {
    if (_data == null) return false;
    return _birthCtrl.text != (_data!.birthDate ?? '') ||
        _weightCtrl.text !=
            (_data!.weightKg != null ? _data!.weightKg.toString() : '');
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await context.read<AuthProvider>().api.patch('/students/me', {
        'birth_date': _birthCtrl.text.isEmpty ? null : _birthCtrl.text,
        'weight_kg': _weightCtrl.text.isEmpty
            ? null
            : double.parse(_weightCtrl.text),
      });
      setState(() => _saveSuccess = true);
      await Future.delayed(const Duration(seconds: 3));
      if (mounted) setState(() => _saveSuccess = false);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _saving = false);
    }
  }

  Future<void> _requestCoach() async {
    setState(() {
      _requestLoading = true;
      _error = null;
    });
    try {
      await context
          .read<AuthProvider>()
          .api
          .post('/auth/request-coach', {});
      setState(() => _coachRequested = true);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _requestLoading = false);
    }
  }

  Future<void> _signOut() async {
    await context.read<AuthProvider>().signOut();
  }

  @override
  void dispose() {
    _birthCtrl.dispose();
    _weightCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = Supabase.instance.client.auth.currentUser;
    final displayName =
        (user?.userMetadata?['full_name'] as String?) ??
            user?.email?.split('@').first ??
            '';
    final initial =
        displayName.isNotEmpty ? displayName[0].toUpperCase() : '?';

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Perfil', style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 16),

        // User info card
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: AppColors.teal.withAlpha(26),
                  child: Text(initial,
                      style: GoogleFonts.syne(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          color: AppColors.teal)),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(displayName,
                          style: Theme.of(context).textTheme.titleLarge,
                          overflow: TextOverflow.ellipsis),
                      Text(user?.email ?? '',
                          style: Theme.of(context).textTheme.bodySmall),
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.gray,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text('Aluno',
                            style: TextStyle(
                                fontSize: 12,
                                color: AppColors.teal.withAlpha(128))),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),

        // Personal data
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Dados pessoais',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 14),
                Text('Data de nascimento',
                    style: TextStyle(
                        fontSize: 14, color: AppColors.teal.withAlpha(153))),
                const SizedBox(height: 6),
                TextField(
                  controller: _birthCtrl,
                  keyboardType: TextInputType.datetime,
                  decoration: const InputDecoration(
                    hintText: 'AAAA-MM-DD',
                    isDense: true,
                  ),
                  style:
                      GoogleFonts.jetBrainsMono(fontSize: 14, color: AppColors.teal),
                ),
                const SizedBox(height: 14),
                Text('Peso (kg)',
                    style: TextStyle(
                        fontSize: 14, color: AppColors.teal.withAlpha(153))),
                const SizedBox(height: 6),
                TextField(
                  controller: _weightCtrl,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                    hintText: 'ex: 75.5',
                    isDense: true,
                  ),
                  style:
                      GoogleFonts.jetBrainsMono(fontSize: 14, color: AppColors.teal),
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
                    onPressed: _saving || !_hasChanges ? null : _save,
                    child: Text(_saving
                        ? 'Salvando...'
                        : _saveSuccess
                            ? 'Salvo!'
                            : 'Salvar'),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),

        // Coach request
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Quer ser Coach?',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 6),
                Text(
                  'Solicite a promoção para coach e crie fichas de treino para seus alunos.',
                  style: TextStyle(
                      fontSize: 14,
                      color: AppColors.teal.withAlpha(153),
                      height: 1.5),
                ),
                const SizedBox(height: 14),
                if (_coachRequested)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.copper.withAlpha(26),
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: const Text(
                      'Solicitação enviada — aguardando aprovação',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: AppColors.copper,
                      ),
                    ),
                  )
                else
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed:
                          _requestLoading ? null : _requestCoach,
                      child: Text(_requestLoading
                          ? 'Enviando...'
                          : 'Solicitar perfil de Coach'),
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),

        // Sign out
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: _signOut,
            child: const Text('Sair da conta'),
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }
}
