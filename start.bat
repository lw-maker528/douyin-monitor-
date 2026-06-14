@echo off
chcp 65001 >nul
echo ========================================
echo   鎶栭煶鐩存挱闂寸洃鎺?- 鍚姩鑴氭湰
echo ========================================
echo.
echo 姝ｅ湪鍚姩鏈嶅姟...
cd /d "%~dp0"
node server.js
pause