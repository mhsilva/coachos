import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'env.dart';

/// Lightweight HTTP client that mirrors frontend/src/lib/api.ts.
class ApiClient {
  final String _token;
  final String _baseUrl;

  ApiClient(this._token, [String? baseUrl])
      : _baseUrl = baseUrl ?? Env.apiBaseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_token',
      };

  Uri _uri(String path) => Uri.parse('$_baseUrl$path');

  Future<dynamic> get(String path) async {
    final res = await http.get(_uri(path), headers: _headers);
    return _handle(res);
  }

  Future<dynamic> post(String path, [Object? body]) async {
    final res = await http.post(
      _uri(path),
      headers: _headers,
      body: body != null ? jsonEncode(body) : null,
    );
    return _handle(res);
  }

  Future<dynamic> patch(String path, [Object? body]) async {
    final res = await http.patch(
      _uri(path),
      headers: _headers,
      body: body != null ? jsonEncode(body) : null,
    );
    return _handle(res);
  }

  Future<dynamic> delete(String path) async {
    final res = await http.delete(_uri(path), headers: _headers);
    return _handle(res);
  }

  /// Multipart POST for file uploads (assessments).
  Future<dynamic> postForm(String path, http.MultipartRequest request) async {
    request.headers['Authorization'] = 'Bearer $_token';
    final streamed = await request.send();
    final res = await http.Response.fromStream(streamed);
    return _handle(res);
  }

  /// SSE streaming POST — yields parsed JSON events as they arrive.
  Stream<Map<String, dynamic>> streamPost(
    String path,
    Object body,
  ) async* {
    final request = http.Request('POST', _uri(path));
    request.headers.addAll({
      ..._headers,
      'Accept': 'text/event-stream',
    });
    request.body = jsonEncode(body);

    final client = http.Client();
    try {
      final streamed = await client.send(request);
      if (streamed.statusCode >= 400) {
        final body = await streamed.stream.bytesToString();
        final err = _tryJson(body);
        throw ApiException(
          err?['detail']?.toString() ?? 'Erro ${streamed.statusCode}',
        );
      }

      var buffer = '';
      await for (final chunk in streamed.stream.transform(utf8.decoder)) {
        buffer += chunk;
        var boundary = buffer.indexOf('\n\n');
        while (boundary != -1) {
          final block = buffer.substring(0, boundary);
          buffer = buffer.substring(boundary + 2);
          for (final line in block.split('\n')) {
            final trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            final payload = trimmed.substring(5).trim();
            if (payload.isEmpty) continue;
            final parsed = _tryJson(payload);
            if (parsed != null) yield parsed;
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
    } finally {
      client.close();
    }
  }

  dynamic _handle(http.Response res) {
    if (res.statusCode == 204) return {};
    if (res.statusCode >= 400) {
      final err = _tryJson(res.body);
      throw ApiException(
        err?['detail']?.toString() ?? 'Erro ${res.statusCode}',
      );
    }
    if (res.body.isEmpty) return {};
    return jsonDecode(res.body);
  }

  Map<String, dynamic>? _tryJson(String raw) {
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }
}

class ApiException implements Exception {
  final String message;
  ApiException(this.message);

  @override
  String toString() => message;
}
