#!/bin/bash

# 微信云函数上传脚本
# 注意：此脚本需要微信开发者工具的命令行支持

echo "======================================"
echo "微信云函数上传脚本"
echo "======================================"
echo ""

# 检查是否在正确的目录
if [ ! -d "cloudfunctions" ]; then
    echo "错误：请在项目根目录运行此脚本"
    exit 1
fi

# 云函数列表
CLOUD_FUNCTIONS=("checkin" "getLeaderboard" "saveUserProfile" "syncData" "updateGameData")

echo "需要上传的云函数："
for func in "${CLOUD_FUNCTIONS[@]}"; do
    echo "  - $func"
done
echo ""

echo "======================================"
echo "上传方式 1：使用微信开发者工具（推荐）"
echo "======================================"
echo ""
echo "1. 打开微信开发者工具"
echo "2. 打开项目：/Users/chenminghong/Desktop/work/popit"
echo "3. 在左侧文件树中，右键点击 cloudfunctions 目录"
echo "4. 选择'上传并部署：云端安装依赖'"
echo "5. 依次上传以下云函数："
for func in "${CLOUD_FUNCTIONS[@]}"; do
    echo "   - $func"
done
echo ""
echo "======================================"
echo "上传方式 2：使用命令行工具"
echo "======================================"
echo ""
echo "如果已安装微信开发者工具命令行工具，可以使用："
echo ""
for func in "${CLOUD_FUNCTIONS[@]}"; do
    echo "  /Applications/微信开发者工具.app/Contents/MacOS/cli -u cloudfunctions/$func"
done
echo ""
echo "======================================"
echo "上传后验证"
echo "======================================"
echo ""
echo "1. 登录微信云开发控制台"
echo "2. 进入'云函数'页面"
echo "3. 检查以下云函数的更新时间和状态："
for func in "${CLOUD_FUNCTIONS[@]}"; do
    echo "   - $func"
done
echo ""
echo "4. 查看云函数日志，确认无错误"
echo ""
echo "======================================"
echo "完成！"
echo "======================================"
