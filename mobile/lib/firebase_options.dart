import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError('Web is not supported.');
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      default:
        throw UnsupportedError('${defaultTargetPlatform.name} is not supported.');
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyASvPuUhV3IO0dF5Ot7evdEwkc-60Pf_PU',
    appId: '1:81424281299:android:315a7eade5595b616d2e26',
    messagingSenderId: '81424281299',
    projectId: 'coachos-6faca',
    storageBucket: 'coachos-6faca.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyDnw1AC1uNWnB7nFKGEUcuwAfn31104xT4',
    appId: '1:81424281299:ios:081dc82a979972386d2e26',
    messagingSenderId: '81424281299',
    projectId: 'coachos-6faca',
    storageBucket: 'coachos-6faca.firebasestorage.app',
    iosBundleId: 'com.coachos.coachosMobile',
  );
}
