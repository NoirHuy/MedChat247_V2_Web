@echo off
title MedChat247 Modal GPU Pre-Warm
cd /d "%~dp0"
echo ===================================================
echo     DANG KHOI DONG VA GIU AM MODEL MODAL GPU...
echo ===================================================
node warmup.js --keep
pause
