import 'dart:async';
import 'dart:math';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import '../core/theme.dart';

/// Full-screen rest timer modal with circular countdown and audio beep.
class RestTimerModal extends StatefulWidget {
  final int seconds;
  final VoidCallback onClose;

  const RestTimerModal({
    super.key,
    required this.seconds,
    required this.onClose,
  });

  @override
  State<RestTimerModal> createState() => _RestTimerModalState();
}

class _RestTimerModalState extends State<RestTimerModal> {
  late int _remaining;
  Timer? _timer;
  bool _beeped = false;

  @override
  void initState() {
    super.initState();
    _remaining = widget.seconds;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_remaining <= 1) {
        setState(() => _remaining = 0);
        _timer?.cancel();
        _playBeep();
        Future.delayed(const Duration(seconds: 1), widget.onClose);
      } else {
        setState(() => _remaining--);
      }
    });
  }

  Future<void> _playBeep() async {
    if (_beeped) return;
    _beeped = true;
    try {
      final player = AudioPlayer();
      // Generate a short beep using a tone
      await player.play(
        AssetSource('beep.mp3'),
        volume: 0.8,
      );
      // Fallback: if no asset, use a URL or just vibrate
    } catch (_) {
      // Audio not available — ignore
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pct = _remaining / widget.seconds;

    return Container(
      color: Colors.black54,
      child: Center(
        child: Container(
          width: 280,
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'DESCANSO',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  color: AppColors.teal.withAlpha(128),
                  letterSpacing: 2,
                ),
              ),
              const SizedBox(height: 16),
              // Circular timer
              SizedBox(
                width: 112,
                height: 112,
                child: CustomPaint(
                  painter: _TimerPainter(pct),
                  child: Center(
                    child: Text(
                      '$_remaining',
                      style: const TextStyle(
                        fontFamily: 'JetBrains Mono',
                        fontSize: 32,
                        fontWeight: FontWeight.bold,
                        color: AppColors.teal,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                _remaining > 0 ? 'Próxima série em breve...' : 'Bora!',
                style: TextStyle(
                  fontSize: 14,
                  color: AppColors.teal.withAlpha(128),
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: widget.onClose,
                  child: const Text('Pular descanso'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TimerPainter extends CustomPainter {
  final double progress;
  _TimerPainter(this.progress);

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 4;

    // Background circle
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..color = AppColors.teal.withAlpha(20)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 8,
    );

    // Progress arc
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -pi / 2,
      2 * pi * progress,
      false,
      Paint()
        ..color = AppColors.copper
        ..style = PaintingStyle.stroke
        ..strokeWidth = 8
        ..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(_TimerPainter old) => old.progress != progress;
}
