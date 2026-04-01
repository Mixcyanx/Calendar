import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  getDocFromServer
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { db, auth, googleProvider } from './firebase';
import { ScheduleItem, Theme } from './types';
import { motion, AnimatePresence } from 'framer-motion';

const ADMIN_EMAIL = 's02204.double@gmail.com';

export default function App() {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('appTheme') as Theme) || 'tech';
    } catch (e) {
      console.warn('localStorage access failed:', e);
      return 'tech';
    }
  });

  useEffect(() => {
    console.log('App component mounted, theme:', theme);
  }, []);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isExamFilter, setIsExamFilter] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentMonthIndex, setCurrentMonthIndex] = useState(0);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Form states
  const [formData, setFormData] = useState({
    year: new Date().getFullYear().toString(),
    month: (new Date().getMonth() + 1).toString().padStart(2, '0'),
    day: new Date().getDate().toString().padStart(2, '0'),
    course: '',
    todo: '',
    note: '',
    isExam: false
  });

  // 1. Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      // Automatically set admin if email matches
      if (u && u.email === ADMIN_EMAIL) {
        setIsAdmin(true);
      } else if (!u) {
        setIsAdmin(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Firestore Sync
  useEffect(() => {
    const q = query(collection(db, 'schedule'), orderBy('date', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ScheduleItem[];
      setItems(data);
      setIsLoading(false);
    }, (error) => {
      console.error("Firestore Error:", error);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Test connection
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  // 3. Theme
  useEffect(() => {
    try {
      document.body.className = theme === 'tech' ? '' : `theme-${theme}`;
      localStorage.setItem('appTheme', theme);
    } catch (e) {
      console.warn('Theme update failed:', e);
    }
  }, [theme]);

  // 3.5. Date Clamping
  useEffect(() => {
    const maxDays = new Date(parseInt(formData.year), parseInt(formData.month), 0).getDate();
    if (parseInt(formData.day) > maxDays) {
      setFormData(prev => ({ ...prev, day: maxDays.toString().padStart(2, '0') }));
    }
  }, [formData.year, formData.month]);

  // 4. Derived State
  const uniqueMonths = useMemo(() => {
    const filtered = isExamFilter ? items.filter(i => i.isExam) : items;
    const months = new Set<string>();
    filtered.forEach(item => {
      if (item.date) {
        const month = item.date.substring(0, 7).replace('-', '/');
        months.add(month);
      }
    });
    return Array.from(months).sort();
  }, [items, isExamFilter]);

  const currentMonth = uniqueMonths[currentMonthIndex] || '';

  const filteredItems = useMemo(() => {
    let result = items;
    if (isExamFilter) result = result.filter(i => i.isExam);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(i => 
        i.course.toLowerCase().includes(term) || 
        i.todo.toLowerCase().includes(term) || 
        i.note.toLowerCase().includes(term) ||
        i.date.includes(term)
      );
    } else if (currentMonth) {
      result = result.filter(i => i.date.replace(/-/g, '/').startsWith(currentMonth));
    }
    return result.sort((a, b) => a.date.localeCompare(b.date));
  }, [items, isExamFilter, searchTerm, currentMonth]);

  const upcomingExam = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0].replace(/-/g, '/');
    return items
      .filter(i => i.isExam && i.date.replace(/-/g, '/') >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
  }, [items]);

  const daysUntilExam = useMemo(() => {
    if (!upcomingExam) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const [y, m, d] = upcomingExam.date.split('/').map(Number);
    const examDate = new Date(y, m - 1, d);
    examDate.setHours(0, 0, 0, 0);
    const diffTime = examDate.getTime() - now.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }, [upcomingExam]);

  // 5. Actions
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      setIsMenuOpen(false);
      setShowPasswordModal(true);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === '514') {
      setIsAdmin(true);
      setShowPasswordModal(false);
      setPasswordInput('');
    } else {
      alert('授權失敗：存取密鑰錯誤。');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setIsAdmin(false);
    setIsMenuOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    
    const dateStr = `${formData.year}/${formData.month}/${formData.day}`;
    const data = {
      course: formData.course,
      todo: formData.todo,
      note: formData.note,
      isExam: formData.isExam,
      date: dateStr,
      updatedAt: new Date().toISOString()
    };

    try {
      if (editingItem) {
        await updateDoc(doc(db, 'schedule', editingItem.id), data);
      } else {
        await addDoc(collection(db, 'schedule'), {
          ...data,
          createdAt: new Date().toISOString()
        });
      }
      resetForm();
    } catch (error) {
      console.error("Save failed:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin || !window.confirm("確認刪除此目標數據？")) return;
    try {
      await deleteDoc(doc(db, 'schedule', id));
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const resetForm = () => {
    setFormData({
      year: new Date().getFullYear().toString(),
      month: (new Date().getMonth() + 1).toString().padStart(2, '0'),
      day: new Date().getDate().toString().padStart(2, '0'),
      course: '',
      todo: '',
      note: '',
      isExam: false
    });
    setEditingItem(null);
    setIsFormOpen(false);
  };

  const startEdit = (item: ScheduleItem) => {
    setEditingItem(item);
    const [y, m, d] = item.date.split('/');
    setFormData({
      year: y,
      month: m,
      day: d,
      course: item.course,
      todo: item.todo,
      note: item.note,
      isExam: !!item.isExam
    });
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const seedData = async () => {
    if (!isAdmin || !window.confirm("確認要匯入初始預設數據？這將會新增多筆項目。")) return;
    setIsLoading(true);
    const initialData = [
      { date: "2026/02/23", course: "國文", todo: "開學準備", note: "領取課本", isExam: false },
      { date: "2026/02/24", course: "程式設計(二)", todo: "環境設定", note: "安裝 VS Code", isExam: false },
      { date: "2026/02/25", course: "作業系統概論", todo: "課程大綱", note: "確認教科書", isExam: false },
      { date: "2026/02/26", course: "英文", todo: "分班測驗", note: "10:00 AM", isExam: true },
      { date: "2026/03/02", course: "作業系統概論", todo: "課程介紹", note: "評分標準說明", isExam: false },
      { date: "2026/03/05", course: "Python程式設計", todo: "安裝環境", note: "Anaconda / Jupyter", isExam: false },
      { date: "2026/03/10", course: "國文", todo: "開學考", note: "範圍：第一課至第三課", isExam: true },
      { date: "2026/03/15", course: "程式設計(二)", todo: "作業一繳交", note: "使用 C++ 實作", isExam: false },
      { date: "2026/03/20", course: "作業系統概論", todo: "小考", note: "範圍：Ch 1-2", isExam: true },
      { date: "2026/03/25", course: "英文", todo: "單字測驗", note: "Unit 1-3", isExam: true },
      { date: "2026/03/30", course: "Python程式設計", todo: "小考", note: "基礎語法", isExam: true },
      { date: "2026/04/11", course: "國文", todo: "習作一（飲食札記）", note: "", isExam: false },
      { date: "2026/04/11", course: "程式設計(二)", todo: "上機考", note: "", isExam: true },
      { date: "2026/04/16", course: "作業系統概論", todo: "期中考", note: "範圍：1, 4, 5, 6", isExam: true },
      { date: "2026/04/17", course: "英文", todo: "期中考", note: "範圍：單元7-9", isExam: true },
      { date: "2026/04/22", course: "Python程式設計", todo: "期中考", note: "", isExam: true },
      { date: "2026/05/16", course: "國文", todo: "分組報告", note: "", isExam: false },
      { date: "2026/05/16", course: "程式設計(二)", todo: "上機考", note: "", isExam: true },
      { date: "2026/05/22", course: "英文", todo: "口頭報告", note: "33-21號", isExam: false },
      { date: "2026/05/29", course: "英文", todo: "口頭報告", note: "20-1號", isExam: false },
      { date: "2026/05/23", course: "國文", todo: "分組報告、習作二", note: "", isExam: false },
      { date: "2026/05/30", course: "國文", todo: "分組報告", note: "", isExam: false },
      { date: "2026/06/10", course: "Python程式設計", todo: "期末考", note: "", isExam: true },
      { date: "2026/06/11", course: "作業系統概論", todo: "期末考", note: "範圍：2, 3, 7, 8", isExam: true },
      { date: "2026/06/12", course: "英文", todo: "期末考", note: "範圍：單元10-12", isExam: true },
      { date: "2026/06/13", course: "國文", todo: "期末考", note: "", isExam: true },
      { date: "2026/06/13", course: "程式設計(二)", todo: "上機考", note: "", isExam: true },
    ];

    try {
      for (const item of initialData) {
        await addDoc(collection(db, 'schedule'), {
          ...item,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      alert("數據匯入成功！");
    } catch (error) {
      console.error("Seed failed:", error);
      alert("數據匯入失敗，請檢查權限。");
    } finally {
      setIsLoading(false);
      setIsMenuOpen(false);
    }
  };

  return (
    <div className="container">
      {/* 管理員快速新增按鈕 (FAB) */}
      {isAdmin && !isFormOpen && (
        <motion.button 
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="fab-add"
          onClick={() => { setIsFormOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        >
          <span>➕</span>
        </motion.button>
      )}

      {/* 三槓選單 */}
      <div className="menu-container">
        <button className="menu-btn" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          <span>☰</span> 選單
        </button>
        <div className={`dropdown-menu ${isMenuOpen ? 'show' : ''}`}>
          {!user ? (
            <button className="dropdown-item" onClick={handleLogin}>
              <span>🛡️</span> 管理員登入
            </button>
          ) : (
            <>
              <div style={{ padding: '10px 20px', fontSize: '11px', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                登入身分: {user.email}
              </div>
              {isAdmin && (
                <>
                  <button className="dropdown-item" onClick={() => { setIsFormOpen(!isFormOpen); setIsMenuOpen(false); }}>
                    <span>➕</span> {isFormOpen ? '關閉表單' : '新增事項'}
                  </button>
                  <button className="dropdown-item" onClick={seedData}>
                    <span>📥</span> 匯入初始數據
                  </button>
                </>
              )}
              <button className="dropdown-item" onClick={handleLogout}>
                <span>🔓</span> 登出管理員
              </button>
            </>
          )}
          <button className="dropdown-item" onClick={() => { setIsExamFilter(!isExamFilter); setIsMenuOpen(false); }}>
            <span>{isExamFilter ? '📋' : '📝'}</span> {isExamFilter ? '顯示所有項目' : '只顯示考試'}
          </button>
          <div style={{ padding: '10px 20px', fontSize: '11px', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>色彩模式</div>
          <button className="dropdown-item" onClick={() => { setTheme('tech'); setIsMenuOpen(false); }}>
            <span>💠</span> 科技風
          </button>
          <button className="dropdown-item" onClick={() => { setTheme('dark'); setIsMenuOpen(false); }}>
            <span>🌙</span> 深色模式
          </button>
          <button className="dropdown-item" onClick={() => { setTheme('white'); setIsMenuOpen(false); }}>
            <span>☀️</span> 白色模式
          </button>
        </div>
      </div>

      {/* 狀態顯示 (僅管理員可見) */}
      {isAdmin && (
        <div className="admin-status-badge">
          [ 狀態: 已授權管理員存取 ]
        </div>
      )}

      <h2>軟創行事曆系統</h2>

      {/* 科技風跑馬燈 */}
      <div className="ticker-container">
        <div className="ticker-content">
          {upcomingExam ? (
            <div className="ticker-item">
              <span>[ 最近考試: {upcomingExam.date.replace(/-/g, '/')} ]</span> {upcomingExam.course} - {upcomingExam.todo} {daysUntilExam !== null && `(倒數 ${daysUntilExam} 天)`}
            </div>
          ) : (
            <div className="ticker-item">
              <span>[ 系統通知 ]</span> 目前無近期考試，系統運作正常。
            </div>
          )}
        </div>
      </div>

      {/* 上方：搜尋 */}
      <div className="controls-section">
        <div className="search-box">
          <span className="search-icon">⚡</span>
          <input
            type="text"
            placeholder="查詢課程>>>"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoComplete="off"
          />
          {isAdmin && (
            <button 
              className="btn btn-primary" 
              style={{ marginLeft: '10px', whiteSpace: 'nowrap' }}
              onClick={() => setIsFormOpen(!isFormOpen)}
            >
              {isFormOpen ? '關閉' : '新增'}
            </button>
          )}
        </div>

        {/* 管理員新增/編輯表單 */}
        <AnimatePresence>
          {isFormOpen && isAdmin && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="admin-form active"
            >
              <h3>{editingItem ? '📝 修改系統事件' : '➕ 初始化新事件'}</h3>
              <div className="form-grid">
                <div style={{ display: 'flex', gap: '8px', gridColumn: 'span 2' }}>
                  <select 
                    value={formData.year}
                    onChange={(e) => setFormData({...formData, year: e.target.value})}
                    className="admin-select"
                    style={{ flex: 1 }}
                  >
                    {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}年</option>)}
                  </select>
                  <select 
                    value={formData.month}
                    onChange={(e) => setFormData({...formData, month: e.target.value})}
                    className="admin-select"
                    style={{ flex: 1 }}
                  >
                    {Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0')).map(m => (
                      <option key={m} value={m}>{m}月</option>
                    ))}
                  </select>
                  <select 
                    value={formData.day}
                    onChange={(e) => setFormData({...formData, day: e.target.value})}
                    className="admin-select"
                    style={{ flex: 1 }}
                  >
                    {Array.from({ length: new Date(parseInt(formData.year), parseInt(formData.month), 0).getDate() }, (_, i) => (i + 1).toString().padStart(2, '0')).map(d => (
                      <option key={d} value={d}>{d}日</option>
                    ))}
                  </select>
                </div>
                <input 
                  type="text" 
                  placeholder="課程名稱"
                  value={formData.course}
                  onChange={(e) => setFormData({...formData, course: e.target.value})}
                  required
                />
                <input 
                  type="text" 
                  placeholder="任務 / 事件項目"
                  value={formData.todo}
                  onChange={(e) => setFormData({...formData, todo: e.target.value})}
                  required
                />
                <input 
                  type="text" 
                  placeholder="備註 / 元數據"
                  value={formData.note}
                  onChange={(e) => setFormData({...formData, note: e.target.value})}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-main)', cursor: 'pointer', gridColumn: 'span 2' }}>
                  <input 
                    type="checkbox" 
                    checked={formData.isExam}
                    onChange={(e) => setFormData({...formData, isExam: e.target.checked})}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  標記為考試
                </label>
              </div>
              <div className="admin-form-actions">
                <button className="btn" onClick={resetForm}>取消</button>
                <button className="btn btn-primary" onClick={handleSubmit}>{editingItem ? '更新' : '執行'}</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 表格區塊 */}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th style={{ width: '120px' }}>日期</th>
              <th style={{ width: '200px' }}>課程</th>
              <th style={{ width: 'auto' }}>項目</th>
              <th style={{ width: '250px' }}>備註</th>
              {isAdmin && <th style={{ width: '120px' }}>操作</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="status-message">[ 正在建立安全連線... ]</td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="status-message">[ 未偵測到數據流 ]</td>
              </tr>
            ) : (
              filteredItems.map(item => (
                <tr key={item.id}>
                  <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {item.date.includes('/') ? item.date.split('/').slice(1).join('/') : item.date}
                  </td>
                  <td style={{ color: 'var(--accent-neon)', fontWeight: 'bold' }}>{item.course}</td>
                  <td>
                    {item.isExam && (
                      <span style={{ background: 'var(--danger)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', marginRight: '6px', verticalAlign: 'middle' }}>考試</span>
                    )}
                    {item.todo}
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{item.note || '-'}</td>
                  {isAdmin && (
                    <td>
                      <div className="action-btns">
                        <button className="icon-btn" onClick={() => startEdit(item)} title="編輯">✎</button>
                        <button className="icon-btn delete" onClick={() => handleDelete(item.id)} title="刪除">✖</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 下方：月份切換 */}
      {!searchTerm && uniqueMonths.length > 0 && (
        <div className="pagination-controls">
          <button className="btn" disabled={currentMonthIndex === 0} onClick={() => setCurrentMonthIndex(currentMonthIndex - 1)}>
            上個月
          </button>
          <span className="current-month-display">
            {currentMonth.split('/')[1] || ''}月
          </span>
          <button className="btn" disabled={currentMonthIndex === uniqueMonths.length - 1} onClick={() => setCurrentMonthIndex(currentMonthIndex + 1)}>
            下個月
          </button>
        </div>
      )}

      {/* Password Modal */}
      <AnimatePresence>
        {showPasswordModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[10000] flex items-center justify-center p-5"
          >
            <motion.form 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onSubmit={handlePasswordSubmit}
              className="bg-[var(--bg-controls)] border border-[var(--accent-neon)] p-8 rounded-lg w-full max-w-[400px] shadow-[0_0_50px_var(--accent-glow)]"
            >
              <h3 className="text-[var(--accent-neon)] text-xl mb-6 font-bold tracking-widest text-center uppercase">
                🛡️ 管理員授權
              </h3>
              <p className="text-[var(--text-secondary)] text-sm mb-6 text-center">
                請輸入存取密鑰以啟用管理權限
              </p>
              <input 
                type="password"
                autoFocus
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="ENTER ACCESS KEY"
                className="w-full bg-black/50 border border-[var(--border-color)] p-4 rounded text-center text-xl tracking-[10px] text-[var(--accent-neon)] focus:outline-none focus:border-[var(--accent-neon)] mb-6"
              />
              <div className="flex gap-4">
                <button 
                  type="button" 
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 py-3 border border-[var(--border-color)] text-[var(--text-secondary)] rounded font-bold hover:bg-white/5 transition-all"
                >
                  取消
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-[var(--accent-neon)] text-black rounded font-bold hover:shadow-[0_0_20px_var(--accent-glow)] transition-all"
                >
                  驗證
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 全域載入動畫 */}
      {isLoading && (
        <div className="loader-overlay">
          <div className="loader-spinner"></div>
          <div style={{ fontFamily: "'JetBrains Mono'", letterSpacing: '2px' }}>SYNCING WITH CLOUD...</div>
        </div>
      )}
    </div>
  );
}
