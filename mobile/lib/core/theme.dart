import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// CoachOS design system tokens, matching tailwind.config.ts.
class AppColors {
  static const teal = Color(0xFF16323F);
  static const copper = Color(0xFFB76E4D);
  static const surface = Color(0xFFF4F4F2);
  static const gray = Color(0xFFECECEC);
  static const white = Colors.white;
}

class AppTheme {
  static ThemeData get light {
    return ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: AppColors.surface,
      colorScheme: ColorScheme.light(
        primary: AppColors.copper,
        onPrimary: Colors.white,
        surface: AppColors.surface,
        onSurface: AppColors.teal,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.teal,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: GoogleFonts.syne(
          fontSize: 20,
          fontWeight: FontWeight.w800,
          color: AppColors.teal,
          letterSpacing: -0.4,
        ),
      ),
      textTheme: TextTheme(
        headlineLarge: GoogleFonts.syne(
          fontSize: 24,
          fontWeight: FontWeight.w800,
          color: AppColors.teal,
          letterSpacing: -0.5,
        ),
        headlineMedium: GoogleFonts.syne(
          fontSize: 20,
          fontWeight: FontWeight.w800,
          color: AppColors.teal,
          letterSpacing: -0.4,
        ),
        titleLarge: GoogleFonts.syne(
          fontSize: 16,
          fontWeight: FontWeight.w700,
          color: AppColors.teal,
        ),
        titleMedium: GoogleFonts.syne(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          color: AppColors.teal,
        ),
        bodyLarge: GoogleFonts.inter(
          fontSize: 16,
          color: AppColors.teal,
        ),
        bodyMedium: GoogleFonts.inter(
          fontSize: 14,
          color: AppColors.teal,
        ),
        bodySmall: GoogleFonts.inter(
          fontSize: 12,
          color: AppColors.teal.withAlpha(128),
        ),
        labelLarge: GoogleFonts.jetBrainsMono(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: AppColors.teal,
        ),
        labelSmall: GoogleFonts.jetBrainsMono(
          fontSize: 12,
          color: AppColors.teal.withAlpha(128),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.copper,
          foregroundColor: Colors.white,
          elevation: 0,
          shadowColor: AppColors.copper.withAlpha(80),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(9),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          textStyle: GoogleFonts.syne(
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.teal.withAlpha(153),
          side: BorderSide(color: AppColors.teal.withAlpha(38)),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(9),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          textStyle: GoogleFonts.inter(
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(9),
          borderSide: BorderSide(color: AppColors.teal.withAlpha(38)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(9),
          borderSide: BorderSide(color: AppColors.teal.withAlpha(38)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(9),
          borderSide: const BorderSide(color: AppColors.copper),
        ),
        hintStyle: GoogleFonts.inter(
          fontSize: 14,
          color: AppColors.teal.withAlpha(64),
        ),
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: AppColors.teal.withAlpha(23)),
        ),
        margin: EdgeInsets.zero,
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.teal,
        selectedItemColor: AppColors.copper,
        unselectedItemColor: Colors.white54,
        type: BottomNavigationBarType.fixed,
        selectedLabelStyle: TextStyle(fontSize: 11, fontWeight: FontWeight.w500),
        unselectedLabelStyle: TextStyle(fontSize: 11),
      ),
    );
  }
}
