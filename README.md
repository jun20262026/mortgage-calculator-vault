# 房贷计算器 + 隐私保险箱

> 外观是房贷计算器，实际是隐私保险箱系统

## 功能

### 外观模式（计算器）
- 完整的计算器功能（加减乘除）
- 界面完全仿真房贷计算器
- 其他人看到只是一个普通计算器 App

### 隐私系统（隐藏入口）
- **触发方式**：连续按 `C` 键 5 次 → 输入密码 → 进入隐私系统
- **紧急退出**：随时可以一键退出回计算器界面

### 隐私系统功能
1. **🔐 加密相册** — 导入照片/视频，自动 AES-256 加密存储
2. **📂 加密文件** — 导入任意文件，加密后存储
3. **📝 加密笔记** — 记录敏感信息，加密保存
4. **🌐 隐私浏览器** — 无痕浏览，不保存历史记录
5. **📦 加密压缩包** — 将加密文件打包为密码保护的压缩包

## 安装说明

### 方式一：使用 EAS 云编译（推荐）

1. 安装 Node.js（https://nodejs.org/）
2. 安装 EAS CLI：
   ```bash
   npm install -g eas-cli
   ```
3. 登录 Expo：
   ```bash
   eas login
   ```
4. 配置 Apple 开发者账号（需要免费或付费账号）
5. 触发云编译：
   ```bash
   cd secure-vault-app
   eas build --platform ios --profile preview
   ```
6. 等待编译完成（约 10-20 分钟）
7. 下载 IPA 文件
8. 使用 AltStore / Sideloadly 安装到手机

### 方式二：使用 GitHub Actions 自动编译

1. 在 GitHub 新建仓库（如 `mortgage-calculator-vault`）
2. 上传项目文件到仓库
3. 进入仓库 `Actions` 标签页
4. 选择 `Build iOS IPA` 工作流
5. 点击 `Run workflow`
6. 等待编译完成
7. 在 Artifacts 下载 IPA

### 方式三：本地编译（需要 Mac）

```bash
cd secure-vault-app
npm install
npx expo prebuild -p ios
# 在 Xcode 中打开 ios/mortgage-calculator.xcworkspace
# 连接设备，签名并运行
```

## 使用说明

1. 安装后打开 App，看到的是**房贷计算器**
2. **连续按 `C` 键 5 次**（2秒内完成）
3. 首次使用会要求**设置密码**（至少 4 位）
4. 输入密码后进入**隐私系统**
5. 在隐私系统中可以：
   - 导入照片/视频/文件
   - 创建加密笔记
   - 使用隐私浏览器
   - 创建加密压缩包
6. **紧急退出**：点击左上角"退出"按钮

## 技术说明

- **加密算法**：AES-256 + PBKDF2 密钥派生
- **密码存储**：使用 Expo SecureStore（iOS Keychain）
- **文件存储**：应用沙盒内加密存储，越狱也不易读取
- **无痕浏览**：不保存 Cookie、历史记录、缓存

## 注意事项

⚠️ **重要提醒**：
1. **记住密码！** 忘记密码无法恢复加密数据
2. **定期备份**加密文件
3. **不要删除 App**，会导致加密数据丢失
4. 本 App 仅用于保护个人隐私，请勿用于非法用途

## 编译问题排查

### EAS 编译失败
- 检查 Apple 开发者账号是否有效
- 检查 `bundleIdentifier` 是否唯一
- 查看 EAS 构建日志：`eas build:list`

### IPA 安装失败
- 检查设备是否已信任开发者证书
- 使用 AltStore 时，需要安装 AltServer
- 使用 Sideloadly 时，需要输入 Apple ID

## 项目结构

```
secure-vault-app/
├── App.js                    # 主应用（计算器 + 触发逻辑）
├── src/
│   ├── screens/
│   │   └── PrivateVault.js  # 隐私系统主界面
│   └── utils/
│       └── encryption.js     # 加密工具
├── package.json
├── app.json                 # Expo 配置
├── eas.json                 # EAS 构建配置
└── assets/                 # 图标等资源
```

## 作者

jun20262026

## 许可

MIT License
