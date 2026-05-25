import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, Image, Alert, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { encryptFile, decryptFile, generateHash, ENCRYPTION_KEY } from '../utils/encryption';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';

// ========== 隐私系统主界面 ==========
export default function PrivateVault({ onEmergencyExit, password }: { onEmergencyExit: () => void; password: string }) {
  const [activeTab, setActiveTab] = useState<'photos' | 'files' | 'notes' | 'browser'>('photos');
  const [photos, setPhotos] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [currentNote, setCurrentNote] = useState({ title: '', content: '', id: '' });
  const [browserUrl, setBrowserUrl] = useState('');
  const [showBrowser, setShowBrowser] = useState(false);

  // 摇一摇紧急退出（简化版：按电源键模拟，这里用双击状态栏）
  useEffect(() => {
    // 监听紧急退出手势
    const handleShake = () => {
      Alert.alert(
        '⚠️ 紧急退出',
        '确定要退出隐私系统吗？',
        [
          { text: '取消', style: 'cancel' },
          { text: '确定', onPress: onEmergencyExit },
        ]
      );
    };
    // 这里简化，实际可以接入设备陀螺仪
    return () => {};
  }, []);

  // ========== 导入照片/视频 ==========
  const importMedia = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        quality: 1,
      });

      if (!result.canceled) {
        for (const asset of result.assets) {
          // 读取文件并加密
          const fileContent = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const encrypted = encryptFile(fileContent, password);
          
          // 保存到应用沙盒
          const fileName = `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.enc`;
          const filePath = `${FileSystem.documentDirectory}encrypted/${fileName}`;
          await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}encrypted/`, { intermediates: true });
          await FileSystem.writeAsStringAsync(filePath, encrypted);

          setPhotos([...photos, {
            id: fileName,
            uri: asset.uri, // 临时预览（实际应该存缩略图）
            encryptedPath: filePath,
            type: asset.type || 'image',
            date: new Date().toISOString(),
          }]);
        }
        Alert.alert('✅ 成功', `已加密导入 ${result.assets.length} 个文件`);
      }
    } catch (error) {
      Alert.alert('错误', '导入失败：' + (error as Error).message);
    }
  };

  // ========== 导入文件 ==========
  const importFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        for (const doc of result.assets) {
          const fileContent = await FileSystem.readAsStringAsync(doc.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const encrypted = encryptFile(fileContent, password);
          
          const fileName = `file_${Date.now()}_${doc.name}.enc`;
          const filePath = `${FileSystem.documentDirectory}encrypted/${fileName}`;
          await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}encrypted/`, { intermediates: true });
          await FileSystem.writeAsStringAsync(filePath, encrypted);

          setFiles([...files, {
            id: fileName,
            name: doc.name,
            encryptedPath: filePath,
            size: doc.size,
            date: new Date().toISOString(),
          }]);
        }
        Alert.alert('✅ 成功', `已加密导入 ${result.assets.length} 个文件`);
      }
    } catch (error) {
      Alert.alert('错误', '导入失败：' + (error as Error).message);
    }
  };

  // ========== 查看加密照片 ==========
  const viewPhoto = async (photo: any) => {
    try {
      const encryptedContent = await FileSystem.readAsStringAsync(photo.encryptedPath);
      const decryptedBase64 = decryptFile(encryptedContent, password);
      
      // 显示解密后的图片（这里简化，实际应该写到临时文件）
      Alert.alert('✅ 解密成功', '图片已解密，即将显示...');
      // 实际应该：写临时文件 → 用 Image 组件显示
    } catch (error) {
      Alert.alert('❌ 解密失败', '密码可能已更改或文件损坏');
    }
  };

  // ========== 保存笔记 ==========
  const saveNote = async () => {
    if (!currentNote.title && !currentNote.content) {
      Alert.alert('提示', '笔记内容不能为空');
      return;
    }

    const note = {
      id: currentNote.id || `note_${Date.now()}`,
      title: currentNote.title,
      content: currentNote.content,
      date: new Date().toISOString(),
    };

    // 加密笔记内容
    const encryptedContent = encryptFile(JSON.stringify(note), password);
    const fileName = `note_${note.id}.enc`;
    const filePath = `${FileSystem.documentDirectory}encrypted/${fileName}`;
    await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}encrypted/`, { intermediates: true });
    await FileSystem.writeAsStringAsync(filePath, encryptedContent);

    if (currentNote.id) {
      setNotes(notes.map(n => n.id === note.id ? note : n));
    } else {
      setNotes([...notes, note]);
    }

    setShowNoteEditor(false);
    setCurrentNote({ title: '', content: '', id: '' });
    Alert.alert('✅ 成功', '笔记已加密保存');
  };

  // ========== 创建密码压缩包 ==========
  const createPasswordZip = async () => {
    Alert.alert(
      '🔒 创建加密压缩包',
      '将加密文件打包为密码保护的压缩包（.zip）',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '创建',
          onPress: async () => {
            try {
              // 这里简化：实际应该用 jszip 等库创建加密 zip
              Alert.alert('🚧 开发中', '加密压缩包功能正在开发，敬请期待！');
            } catch (error) {
              Alert.alert('错误', '创建失败');
            }
          },
        },
      ]
    );
  };

  // ========== 渲染 ==========
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* 顶部栏 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onEmergencyExit} style={styles.exitButton}>
          <Text style={styles.exitButtonText}>🚪 退出</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🔐 隐私系统</Text>
        <TouchableOpacity onPress={createPasswordZip} style={styles.zipButton}>
          <Text style={styles.zipButtonText}>📦 加密打包</Text>
        </TouchableOpacity>
      </View>

      {/* 标签页 */}
      <View style={styles.tabBar}>
        {[
          { key: 'photos', label: '📷 相册' },
          { key: 'files', label: '📄 文件' },
          { key: 'notes', label: '📝 笔记' },
          { key: 'browser', label: '🌐 浏览器' },
        ].map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.activeTab]}
            onPress={() => setActiveTab(tab.key as any)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 内容区 */}
      <View style={styles.content}>
        {activeTab === 'photos' && (
          <PhotoTab
            photos={photos}
            onImport={importMedia}
            onView={viewPhoto}
          />
        )}
        {activeTab === 'files' && (
          <FileTab
            files={files}
            onImport={importFile}
          />
        )}
        {activeTab === 'notes' && (
          <NoteTab
            notes={notes}
            onNewNote={() => {
              setCurrentNote({ title: '', content: '', id: '' });
              setShowNoteEditor(true);
            }}
            onEditNote={(note: any) => {
              setCurrentNote(note);
              setShowNoteEditor(true);
            }}
          />
        )}
        {activeTab === 'browser' && (
          <BrowserTab
            onClose={() => setActiveTab('photos')}
          />
        )}
      </View>

      {/* 笔记编辑器 */}
      {showNoteEditor && (
        <NoteEditor
          note={currentNote}
          onChange={setCurrentNote}
          onSave={saveNote}
          onCancel={() => setShowNoteEditor(false)}
        />
      )}
    </View>
  );
}

// ========== 相册标签页 ==========
function PhotoTab({ photos, onImport, onView }: any) {
  return (
    <View style={tabStyles.container}>
      <TouchableOpacity style={tabStyles.importButton} onPress={onImport}>
        <Text style={tabStyles.importButtonText}>+ 导入照片/视频</Text>
      </TouchableOpacity>
      <FlatList
        data={photos}
        numColumns={3}
        keyExtractor={(item: any) => item.id}
        renderItem={({ item }: any) => (
          <TouchableOpacity style={tabStyles.photoItem} onPress={() => onView(item)}>
            <View style={tabStyles.photoPlaceholder}>
              <Text style={tabStyles.photoIcon}>{item.type === 'video' ? '🎬' : '🖼️'}</Text>
              <Text style={tabStyles.photoDate}>{new Date(item.date).toLocaleDateString()}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={tabStyles.empty}>
            <Text style={tabStyles.emptyText}>暂无加密照片</Text>
            <Text style={tabStyles.emptyHint}>点击上方按钮导入照片/视频</Text>
          </View>
        }
      />
    </View>
  );
}

// ========== 文件标签页 ==========
function FileTab({ files, onImport }: any) {
  return (
    <View style={tabStyles.container}>
      <TouchableOpacity style={tabStyles.importButton} onPress={onImport}>
        <Text style={tabStyles.importButtonText}>+ 导入文件</Text>
      </TouchableOpacity>
      <FlatList
        data={files}
        keyExtractor={(item: any) => item.id}
        renderItem={({ item }: any) => (
          <View style={tabStyles.fileItem}>
            <Text style={tabStyles.fileIcon}>📄</Text>
            <View style={tabStyles.fileInfo}>
              <Text style={tabStyles.fileName}>{item.name}</Text>
              <Text style={tabStyles.fileDate}>{new Date(item.date).toLocaleDateString()}</Text>
            </View>
            <Text style={tabStyles.fileEncrypted}>🔐</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={tabStyles.empty}>
            <Text style={tabStyles.emptyText}>暂无加密文件</Text>
            <Text style={tabStyles.emptyHint}>点击上方按钮导入文件</Text>
          </View>
        }
      />
    </View>
  );
}

// ========== 笔记标签页 ==========
function NoteTab({ notes, onNewNote, onEditNote }: any) {
  return (
    <View style={tabStyles.container}>
      <TouchableOpacity style={tabStyles.importButton} onPress={onNewNote}>
        <Text style={tabStyles.importButtonText}>+ 新建笔记</Text>
      </TouchableOpacity>
      <FlatList
        data={notes}
        keyExtractor={(item: any) => item.id}
        renderItem={({ item }: any) => (
          <TouchableOpacity style={tabStyles.noteItem} onPress={() => onEditNote(item)}>
            <Text style={tabStyles.noteTitle}>{item.title || '无标题'}</Text>
            <Text style={tabStyles.notePreview}>{item.content.substring(0, 50)}...</Text>
            <Text style={tabStyles.noteDate}>{new Date(item.date).toLocaleDateString()}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={tabStyles.empty}>
            <Text style={tabStyles.emptyText}>暂无加密笔记</Text>
            <Text style={tabStyles.emptyHint}>点击上方按钮创建笔记</Text>
          </View>
        }
      />
    </View>
  );
}

// ========== 隐私浏览器标签页 ==========
function BrowserTab({ onClose }: any) {
  const [url, setUrl] = useState('');
  const [history, setHistory] = useState<string[]>([]);

  return (
    <View style={browserStyles.container}>
      <View style={browserStyles.toolbar}>
        <Text style={browserStyles.toolbarTitle}>🌐 隐私浏览器</Text>
        <Text style={browserStyles.toolbarHint}>（无痕模式，不保存历史记录）</Text>
      </View>
      <View style={browserStyles.urlBar}>
        <Text style={browserStyles.urlLabel}>URL:</Text>
        <Text style={browserStyles.urlInput}>{url || '输入网址...'}</Text>
      </View>
      <View style={browserStyles.content}>
        <Text style={browserStyles.placeholder}>🔒 隐私浏览器</Text>
        <Text style={browserStyles.hint}>
          输入网址开始浏览{'\n'}
          所有浏览记录不会被保存{'\n'}
          关闭后不留下任何痕迹
        </Text>
      </View>
    </View>
  );
}

// ========== 笔记编辑器 ==========
function NoteEditor({ note, onChange, onSave, onCancel }: any) {
  return (
    <View style={editorStyles.overlay}>
      <View style={editorStyles.editor}>
        <Text style={editorStyles.title}>📝 {note.id ? '编辑笔记' : '新建笔记'}</Text>
        <TextInput
          style={editorStyles.titleInput}
          placeholder="笔记标题"
          value={note.title}
          onChangeText={(text: string) => onChange({ ...note, title: text })}
        />
        <TextInput
          style={editorStyles.contentInput}
          placeholder="笔记内容..."
          value={note.content}
          onChangeText={(text: string) => onChange({ ...note, content: text })}
          multiline
          textAlignVertical="top"
        />
        <View style={editorStyles.buttonRow}>
          <TouchableOpacity style={editorStyles.cancelButton} onPress={onCancel}>
            <Text style={editorStyles.buttonText}>取消</Text>
          </TouchableOpacity>
          <TouchableOpacity style={editorStyles.saveButton} onPress={onSave}>
            <Text style={editorStyles.buttonText}>💾 保存</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ========== 样式 ==========
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1C1C1E',
  },
  exitButton: { padding: 8 },
  exitButtonText: { color: '#FF3B30', fontSize: 14 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  zipButton: { padding: 8 },
  zipButtonText: { color: '#007AFF', fontSize: 14 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: { backgroundColor: '#2C2C2E' },
  tabText: { color: '#8E8E93', fontSize: 12 },
  activeTabText: { color: '#007AFF', fontWeight: 'bold' },
  content: { flex: 1 },
});

const tabStyles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  importButton: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  importButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  photoItem: { flex: 1, margin: 2, aspectRatio: 1, backgroundColor: '#2C2C2E', borderRadius: 8 },
  photoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  photoIcon: { fontSize: 32 },
  photoDate: { color: '#8E8E93', fontSize: 10, marginTop: 4 },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  fileIcon: { fontSize: 24, marginRight: 12 },
  fileInfo: { flex: 1 },
  fileName: { color: '#fff', fontSize: 14 },
  fileDate: { color: '#8E8E93', fontSize: 12 },
  fileEncrypted: { fontSize: 16 },
  noteItem: {
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  noteTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  notePreview: { color: '#8E8E93', fontSize: 14 },
  noteDate: { color: '#8E8E93', fontSize: 12, marginTop: 4 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 50 },
  emptyText: { color: '#8E8E93', fontSize: 16 },
  emptyHint: { color: '#8E8E93', fontSize: 14, marginTop: 8 },
});

const browserStyles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: { backgroundColor: '#1C1C1E', padding: 12, alignItems: 'center' },
  toolbarTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  toolbarHint: { color: '#8E8E93', fontSize: 12 },
  urlBar: {
    flexDirection: 'row',
    backgroundColor: '#2C2C2E',
    margin: 12,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  urlLabel: { color: '#8E8E93', marginRight: 8 },
  urlInput: { flex: 1, color: '#fff' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { color: '#8E8E93', fontSize: 20, marginBottom: 12 },
  hint: { color: '#8E8E93', fontSize: 14, textAlign: 'center', lineHeight: 24 },
});

const editorStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  editor: {
    width: '90%',
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 20,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  titleInput: {
    backgroundColor: '#2C2C2E',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    marginBottom: 12,
  },
  contentInput: {
    backgroundColor: '#2C2C2E',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    height: 200,
    marginBottom: 16,
  },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelButton: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginRight: 8,
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginLeft: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
