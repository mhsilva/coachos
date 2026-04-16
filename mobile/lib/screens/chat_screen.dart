import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/auth_provider.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../widgets/chat_bubble.dart';

class ChatScreen extends StatefulWidget {
  final String chatId;
  const ChatScreen({super.key, required this.chatId});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  ChatMeta? _meta;
  List<ChatMessage> _messages = [];
  bool _loading = true;
  bool _sending = false;
  String? _error;
  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();

  @override
  void initState() {
    super.initState();
    _loadChat();
  }

  Future<void> _loadChat() async {
    try {
      final data = await context
          .read<AuthProvider>()
          .api
          .get('/chats/${widget.chatId}') as Map<String, dynamic>;
      final meta = ChatMeta.fromJson(data);
      setState(() {
        _meta = meta;
        _messages = meta.messages;
      });
    } catch (e) {
      setState(() => _error = e.toString());
    }
    setState(() => _loading = false);
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _handleSend() async {
    final text = _inputCtrl.text.trim();
    if (text.isEmpty || _sending) return;

    setState(() {
      _sending = true;
      _error = null;
      _inputCtrl.clear();
      _messages.add(ChatMessage(role: 'user', content: text));
      _messages.add(ChatMessage(role: 'assistant', content: ''));
    });
    _scrollToBottom();

    try {
      final api = context.read<AuthProvider>().api;
      final stream = api.streamPost(
        '/chats/${widget.chatId}/messages',
        {'content': text},
      );

      await for (final event in stream) {
        final type = event['type'] as String?;
        if (type == 'delta') {
          setState(() {
            final last = _messages.last;
            if (last.role == 'assistant') {
              last.content += event['text'] as String? ?? '';
            }
          });
          _scrollToBottom();
        } else if (type == 'done') {
          if (event['closed'] == true) {
            final finalContent = event['final_content'] as String?;
            if (finalContent != null) {
              setState(() {
                if (_messages.last.role == 'assistant') {
                  _messages.last.content = finalContent;
                }
              });
            }
            setState(() => _meta?.status = 'closed');
          }
        } else if (type == 'error') {
          setState(
              () => _error = event['message'] as String? ?? 'Erro no streaming');
        }
      }
    } catch (e) {
      setState(() {
        _error = e.toString();
        // Roll back empty assistant bubble
        if (_messages.isNotEmpty &&
            _messages.last.role == 'assistant' &&
            _messages.last.content.isEmpty) {
          _messages.removeLast();
        }
      });
    } finally {
      setState(() => _sending = false);
    }
  }

  bool get _canSend =>
      _meta != null && _meta!.status == 'open' && !_sending;

  bool get _isClosed => _meta?.status == 'closed';

  @override
  void dispose() {
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Anamnese'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.copper))
          : _meta == null
              ? Center(
                  child: Text('Chat não encontrado.',
                      style: Theme.of(context).textTheme.bodySmall))
              : Column(
                  children: [
                    // Messages
                    Expanded(
                      child: ListView.separated(
                        controller: _scrollCtrl,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 12),
                        itemCount: _messages.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: 10),
                        itemBuilder: (_, i) {
                          final m = _messages[i];
                          if (m.role == 'assistant' &&
                              m.content.isEmpty &&
                              _sending) {
                            return ChatBubble(
                                role: 'assistant', content: '…');
                          }
                          return ChatBubble(
                              role: m.role, content: m.content);
                        },
                      ),
                    ),

                    // Error
                    if (_error != null)
                      Container(
                        width: double.infinity,
                        color: Colors.red.shade50,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 8),
                        child: Text(_error!,
                            style: TextStyle(
                                fontSize: 13, color: Colors.red.shade700)),
                      ),

                    // Composer
                    if (!_isClosed)
                      Container(
                        padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          border: Border(
                            top: BorderSide(
                                color: AppColors.teal.withAlpha(20)),
                          ),
                        ),
                        child: SafeArea(
                          top: false,
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _inputCtrl,
                                  maxLines: 4,
                                  minLines: 1,
                                  enabled: _canSend,
                                  textInputAction: TextInputAction.send,
                                  onSubmitted: (_) => _handleSend(),
                                  decoration: const InputDecoration(
                                    hintText: 'Escreva sua resposta…',
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              SizedBox(
                                height: 46,
                                child: ElevatedButton(
                                  onPressed: _canSend ? _handleSend : null,
                                  style: ElevatedButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 16),
                                  ),
                                  child: _sending
                                      ? const SizedBox(
                                          width: 18,
                                          height: 18,
                                          child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                              color: Colors.white),
                                        )
                                      : const Text('Enviar'),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),

                    // Closed banner
                    if (_isClosed)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          border: Border(
                            top: BorderSide(
                                color: AppColors.teal.withAlpha(20)),
                          ),
                        ),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              vertical: 10, horizontal: 16),
                          decoration: BoxDecoration(
                            color: AppColors.teal.withAlpha(26),
                            borderRadius: BorderRadius.circular(9),
                          ),
                          child: const Text(
                            'Anamnese finalizada ✓',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                              color: AppColors.teal,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
    );
  }
}
