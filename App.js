import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, Alert, Vibration, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import CryptoJS from 'crypto-js';
import { encryptData, decryptData, ENCRYPTION_KEY } from './src/utils/encryption';

// ========== 隐私系统导入 ==========
import PrivateVault from './src/screens/PrivateVault';

// ========== 常量 ==========
const SECRET_TRIGGER_COUNT = 5; // 按C键5次触发
const WRONG_PASSWORD_LIMIT = 5;  // 错误密码次数限制

// ========== 主应用组件 ==========
export default function App() {
  // 计算器状态
  const [display, setDisplay] = useState('0');
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [cPressCount, setCPressCount] = useState(0);
  const cPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 应用状态
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [wrongAttempts, setWrongAttempts] = useState(0);

  // ========== 密码管理 ==========
  const getStoredPassword = async (): Promise<string | null> => {
    try {
      const pwd = await SecureStore.getItemAsync('vault_password');
      return pwd;
    } catch {
      return null;
    }
  };

  const setStoredPassword = async (password: string): Promise<void> => {
    await SecureStore.setItemAsync('vault_password', password);
  };

  // ========== 秘密触发逻辑 ==========
  const handleCPress = () => {
    // 震动反馈
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Vibration.vibrate(10);
    }

    const newCount = cPressCount + 1;
    setCPressCount(newCount);

    // 重置计时器
    if (cPressTimer.current) clearTimeout(cPressTimer.current);
    cPressTimer.current = setTimeout(() => {
      setCPressCount(0);
    }, 2000); // 2秒内完成5次按C键

    if (newCount >= SECRET_TRIGGER_COUNT) {
      setCPressCount(0);
      handleSecretTrigger();
    }
  };

  const handleSecretTrigger = () => {
    setShowPasswordModal(true);
    setPasswordInput('');
    setWrongAttempts(0);
  };

  const handlePasswordSubmit = async () => {
    try {
      const storedPwd = await getStoredPassword();
      
      if (!storedPwd) {
        // 首次使用，设置密码
        if (passwordInput.length < 4) {
          Alert.alert('提示', '密码至少需要4位');
          return;
        }
        await setStoredPassword(passwordInput);
        setShowPasswordModal(false);
        setIsUnlocked(true);
        Alert.alert('✅ 成功', '密码已设置，隐私系统已解锁');
      } else if (storedPwd === passwordInput) {
        // 密码正确
        setShowPasswordModal(false);
        setIsUnlocked(true);
        setWrongAttempts(0);
      } else {
        // 密码错误
        const newAttempts = wrongAttempts + 1;
        setWrongAttempts(newAttempts);
        setPasswordInput('');
        
        if (newAttempts >= WRONG_PASSWORD_LIMIT) {
          setShowPasswordModal(false);
          Alert.alert('⚠️ 错误次数过多', '请稍后再试');
          setWrongAttempts(0);
        } else {
          Alert.alert('❌ 密码错误', `还剩 ${WRONG_PASSWORD_LIMIT - newAttempts} 次机会`);
        }
      }
    } catch (error) {
      Alert.alert('错误', '密码验证失败');
    }
  };

  // ========== 紧急退出 ==========
  const handleEmergencyExit = () => {
    setIsUnlocked(false);
    setDisplay('0');
    setPrevValue(null);
    setOperator(null);
    setWaitingForOperand(false);
  };

  // ========== 计算器逻辑 ==========
  const inputDigit = (digit: string) => {
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === '0' ? digit : display + digit);
    }
  };

  const inputDot = () => {
    if (waitingForOperand) {
      setDisplay('.');
      setWaitingForOperand(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const clearAll = () => {
    setDisplay('0');
    setPrevValue(null);
    setOperator(null);
    setWaitingForOperand(false);
    handleCPress(); // C键计数
  };

  const clearEntry = () => {
    setDisplay('0');
  };

  const performOperation = (nextOperator: string) => {
    const inputValue = parseFloat(display);

    if (prevValue === null) {
      setPrevValue(inputValue);
    } else if (operator) {
      const result = calculate(prevValue, inputValue, operator);
      setPrevValue(result);
      setDisplay(String(result));
    }

    setWaitingForOperand(true);
    setOperator(nextOperator);
  };

  const calculate = (first: number, second: number, op: string): number => {
    switch (op) {
      case '+': return first + second;
      case '-': return first - second;
      case '×': return first * second;
      case '÷': return second !== 0 ? first / second : 0;
      default: return second;
    }
  };

  const handleEquals = () => {
    const inputValue = parseFloat(display);
    if (prevValue !== null && operator) {
      const result = calculate(prevValue, inputValue, operator);
      setDisplay(String(result));
      setPrevValue(null);
      setOperator(null);
      setWaitingForOperand(true);
    }
  };

  // ========== 房贷计算 ==========
  const calculateMortgage = () => {
    // 简单房贷计算：贷款总额、年利率、贷款年限
    // 这里预留扩展
    Alert.alert('房贷计算', '请输入贷款总额、年利率和贷款年限');
  };

  // ========== 渲染 ==========
  if (isUnlocked) {
    return (
      <PrivateVault 
        onEmergencyExit={handleEmergencyExit}
        password={passwordInput}
      />
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      
      {/* 计算器显示区 */}
      <View style={styles.displayContainer}>
        <Text style={styles.displayText} numberOfLines={1} adjustsFontSizeToFit>
          {display}
        </Text>
      </View>

      {/* 计算器按钮区 */}
      <View style={styles.buttonContainer}>
        {/* 第一行 */}
        <View style={styles.row}>
          <TouchableOpacity style={[styles.button, styles.functionButton]} onPress={clearAll}>
            <Text style={styles.buttonText}>C</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.functionButton]} onPress={clearEntry}>
            <Text style={styles.buttonText}>CE</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.functionButton]} onPress={() => Alert.alert('房贷计算', '功能开发中')}>
            <Text style={styles.buttonText}>🏠</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.operatorButton]} onPress={() => performOperation('÷')}>
            <Text style={styles.buttonText}>÷</Text>
          </TouchableOpacity>
        </View>

        {/* 第二行 */}
        <View style={styles.row}>
          <TouchableOpacity style={styles.button} onPress={() => inputDigit('7')}>
            <Text style={styles.buttonText}>7</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => inputDigit('8')}>
            <Text style={styles.buttonText}>8</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => inputDigit('9')}>
            <Text style={styles.buttonText}>9</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.operatorButton]} onPress={() => performOperation('×')}>
            <Text style={styles.buttonText}>×</Text>
          </TouchableOpacity>
        </View>

        {/* 第三行 */}
        <View style={styles.row}>
          <TouchableOpacity style={styles.button} onPress={() => inputDigit('4')}>
            <Text style={styles.buttonText}>4</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => inputDigit('5')}>
            <Text style={styles.buttonText}>5</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => inputDigit('6')}>
            <Text style={styles.buttonText}>6</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.operatorButton]} onPress={() => performOperation('-')}>
            <Text style={styles.buttonText}>-</Text>
          </TouchableOpacity>
        </View>

        {/* 第四行 */}
        <View style={styles.row}>
          <TouchableOpacity style={styles.button} onPress={() => inputDigit('1')}>
            <Text style={styles.buttonText}>1</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => inputDigit('2')}>
            <Text style={styles.buttonText}>2</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => inputDigit('3')}>
            <Text style={styles.buttonText}>3</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.operatorButton]} onPress={() => performOperation('+')}>
            <Text style={styles.buttonText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* 第五行 */}
        <View style={styles.row}>
          <TouchableOpacity style={[styles.button, styles.zeroButton]} onPress={() => inputDigit('0')}>
            <Text style={styles.buttonText}>0</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={inputDot}>
            <Text style={styles.buttonText}>.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.equalsButton]} onPress={handleEquals}>
            <Text style={[styles.buttonText, styles.equalsText]}>=</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 密码输入模态框 */}
      {showPasswordModal && (
        <PasswordModal
          passwordInput={passwordInput}
          setPasswordInput={setPasswordInput}
          onSubmit={handlePasswordSubmit}
          onCancel={() => {
            setShowPasswordModal(false);
            setPasswordInput('');
          }}
          isNew={!getStoredPassword()}
        />
      )}
    </View>
  );
}

// ========== 密码输入组件 ==========
function PasswordModal({ passwordInput, setPasswordInput, onSubmit, onCancel, isNew }: any) {
  return (
    <View style={modalStyles.overlay}>
      <View style={modalStyles.modal}>
        <Text style={modalStyles.title}>
          {isNew ? '🔐 设置密码' : '🔐 输入密码'}
        </Text>
        <Text style={modalStyles.subtitle}>
          {isNew ? '请设置隐私系统密码（至少4位）' : '请输入隐私系统密码'}
        </Text>
        
        <View style={modalStyles.inputContainer}>
          <Text style={modalStyles.inputLabel}>密码：</Text>
          <Text style={modalStyles.inputValue}>
            {'•'.repeat(passwordInput.length)}
          </Text>
        </View>

        {/* 数字键盘 */}
        <View style={modalStyles.keypad}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((num) => (
            <TouchableOpacity
              key={num}
              style={modalStyles.keyButton}
              onPress={() => setPasswordInput(passwordInput + String(num))}
            >
              <Text style={modalStyles.keyText}>{num}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[modalStyles.keyButton, modalStyles.deleteButton]}
            onPress={() => setPasswordInput(passwordInput.slice(0, -1))}
          >
            <Text style={modalStyles.keyText}>⌫</Text>
          </TouchableOpacity>
        </View>

        <View style={modalStyles.buttonRow}>
          <TouchableOpacity style={modalStyles.cancelButton} onPress={onCancel}>
            <Text style={modalStyles.buttonText}>取消</Text>
          </TouchableOpacity>
          <TouchableOpacity style={modalStyles.confirmButton} onPress={onSubmit}>
            <Text style={modalStyles.buttonText}>确认</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ========== 样式 ==========
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'flex-end',
  },
  displayContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 20,
    paddingBottom: 10,
  },
  displayText: {
    fontSize: 60,
    color: '#fff',
    fontWeight: '300',
  },
  buttonContainer: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  button: {
    flex: 1,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 5,
  },
  functionButton: {
    backgroundColor: '#A5A5A5',
  },
  operatorButton: {
    backgroundColor: '#FF9500',
  },
  equalsButton: {
    backgroundColor: '#FF9500',
  },
  zeroButton: {
    flex: 2.2,
    marginRight: 5,
  },
  buttonText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '400',
  },
  equalsText: {
    color: '#fff',
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modal: {
    width: '85%',
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    minWidth: 200,
  },
  inputLabel: {
    color: '#8E8E93',
    fontSize: 16,
  },
  inputValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 20,
  },
  keyButton: {
    width: 60,
    height: 50,
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 4,
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
  },
  keyText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    padding: 12,
    marginRight: 8,
    alignItems: 'center',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    borderRadius: 10,
    padding: 12,
    marginLeft: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
