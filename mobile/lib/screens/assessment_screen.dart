import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'dart:io';
import '../core/auth_provider.dart';
import '../core/env.dart';
import '../core/theme.dart';

const _photoLabels = {'front': 'Frente', 'back': 'Costas', 'side': 'Lateral'};

const _measurements = [
  ('chest_cm', 'Peito'),
  ('waist_narrow_cm', 'Cintura (parte mais fina)'),
  ('waist_navel_cm', 'Cintura (na altura do umbigo)'),
  ('hip_cm', 'Quadril'),
  ('biceps_r_cm', 'Bíceps direito'),
  ('forearm_r_cm', 'Antebraço direito'),
  ('thigh_r_cm', 'Coxa medial direita'),
  ('calf_r_cm', 'Panturrilha direita'),
];

class AssessmentScreen extends StatefulWidget {
  final String assessmentId;
  const AssessmentScreen({super.key, required this.assessmentId});

  @override
  State<AssessmentScreen> createState() => _AssessmentScreenState();
}

class _AssessmentScreenState extends State<AssessmentScreen> {
  bool? _exists; // null = loading
  final Map<String, XFile?> _photos = {'front': null, 'back': null, 'side': null};
  final _weightCtrl = TextEditingController();
  final _bfCtrl = TextEditingController();
  final Map<String, TextEditingController> _measureCtrls = {
    for (final m in _measurements) m.$1: TextEditingController(),
  };
  bool _submitting = false;
  String? _error;
  bool _done = false;

  @override
  void initState() {
    super.initState();
    _validate();
  }

  Future<void> _validate() async {
    try {
      final data = await context
          .read<AuthProvider>()
          .api
          .get('/assessments/${widget.assessmentId}') as Map<String, dynamic>;
      setState(() => _exists = data['status'] == 'pending');
    } catch (_) {
      setState(() => _exists = false);
    }
  }

  Future<void> _pickPhoto(String slot) async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 1200,
      imageQuality: 85,
    );
    if (file != null) setState(() => _photos[slot] = file);
  }

  bool get _canSubmit {
    if (_photos.values.any((f) => f == null)) return false;
    final w = double.tryParse(_weightCtrl.text);
    if (w == null || w <= 0) return false;
    return true;
  }

  Future<void> _handleSubmit() async {
    if (!_canSubmit || _submitting) return;
    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final token = context.read<AuthProvider>().accessToken;
      final uri = Uri.parse(
          '${Env.apiBaseUrl}/assessments/${widget.assessmentId}/submit');
      final request = http.MultipartRequest('POST', uri);
      request.headers['Authorization'] = 'Bearer $token';

      for (final slot in ['front', 'back', 'side']) {
        final file = _photos[slot]!;
        request.files.add(await http.MultipartFile.fromPath(
          'photo_$slot',
          file.path,
        ));
      }

      request.fields['weight_kg'] = _weightCtrl.text;
      if (_bfCtrl.text.isNotEmpty) {
        request.fields['body_fat_pct'] = _bfCtrl.text;
      }
      for (final m in _measurements) {
        final val = _measureCtrls[m.$1]!.text;
        if (val.isNotEmpty) request.fields[m.$1] = val;
      }

      final streamed = await request.send();
      if (streamed.statusCode >= 400) {
        final body = await streamed.stream.bytesToString();
        throw Exception(body);
      }

      setState(() => _done = true);
      await Future.delayed(const Duration(milliseconds: 1500));
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() => _error = 'Erro ao enviar: $e');
    } finally {
      setState(() => _submitting = false);
    }
  }

  @override
  void dispose() {
    _weightCtrl.dispose();
    _bfCtrl.dispose();
    for (final c in _measureCtrls.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Avaliação física'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_exists == null) {
      return const Center(
          child: CircularProgressIndicator(color: AppColors.copper));
    }
    if (_exists == false) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Esta avaliação não está mais disponível.',
                  style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Voltar'),
              ),
            ],
          ),
        ),
      );
    }
    if (_done) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('✅', style: TextStyle(fontSize: 48)),
            const SizedBox(height: 12),
            Text('Avaliação enviada!',
                style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 4),
            Text('Bom trabalho, parceiro.',
                style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          '3 fotos, peso e algumas medidas. Campos de medidas são opcionais.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 16),

        // Photos
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Fotos', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 12),
                Row(
                  children: ['front', 'back', 'side']
                      .map((slot) => Expanded(
                            child: GestureDetector(
                              onTap: () => _pickPhoto(slot),
                              child: Padding(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 3),
                                child: Column(
                                  children: [
                                    AspectRatio(
                                      aspectRatio: 3 / 4,
                                      child: Container(
                                        decoration: BoxDecoration(
                                          color: AppColors.teal.withAlpha(13),
                                          borderRadius:
                                              BorderRadius.circular(12),
                                          border: Border.all(
                                              color: AppColors.teal
                                                  .withAlpha(23)),
                                        ),
                                        clipBehavior: Clip.hardEdge,
                                        child: _photos[slot] != null
                                            ? Image.file(
                                                File(_photos[slot]!.path),
                                                fit: BoxFit.cover,
                                              )
                                            : Center(
                                                child: Icon(
                                                    Icons.camera_alt_outlined,
                                                    color: AppColors.teal
                                                        .withAlpha(76)),
                                              ),
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(_photoLabels[slot]!,
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodySmall),
                                  ],
                                ),
                              ),
                            ),
                          ))
                      .toList(),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),

        // Weight + BF
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Composição',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 12),
                _NumberField(
                  label: 'Peso (kg)',
                  controller: _weightCtrl,
                  required_: true,
                ),
                const SizedBox(height: 12),
                _NumberField(
                  label: 'BF% (opcional)',
                  controller: _bfCtrl,
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),

        // Measurements
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Medidas (cm)',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 12),
                ..._measurements.map((m) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _NumberField(
                        label: m.$2,
                        controller: _measureCtrls[m.$1]!,
                      ),
                    )),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),

        if (_error != null) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.red.shade50,
              borderRadius: BorderRadius.circular(9),
            ),
            child: Text(_error!,
                style: TextStyle(fontSize: 13, color: Colors.red.shade700)),
          ),
          const SizedBox(height: 12),
        ],

        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: !_canSubmit || _submitting ? null : _handleSubmit,
            child: Text(_submitting ? 'Enviando...' : 'Enviar avaliação'),
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }
}

class _NumberField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final bool required_;

  const _NumberField({
    required this.label,
    required this.controller,
    this.required_ = false,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text.rich(
          TextSpan(
            text: label,
            children: [
              if (required_)
                const TextSpan(
                  text: ' *',
                  style: TextStyle(color: AppColors.copper),
                ),
            ],
          ),
          style: TextStyle(fontSize: 14, color: AppColors.teal.withAlpha(153)),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          style: GoogleFonts.jetBrainsMono(fontSize: 14, color: AppColors.teal),
          decoration: const InputDecoration(
            hintText: '—',
            isDense: true,
          ),
        ),
      ],
    );
  }
}
