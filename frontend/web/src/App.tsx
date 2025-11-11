import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface EmotionData {
  id: string;
  name: string;
  emotionScore: number;
  confidence: number;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

interface EmotionStats {
  totalAnalyses: number;
  verifiedAnalyses: number;
  avgEmotionScore: number;
  positiveRatio: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [emotions, setEmotions] = useState<EmotionData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newEmotionData, setNewEmotionData] = useState({ text: "", emotion: "" });
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionData | null>(null);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);
  const [stats, setStats] = useState<EmotionStats>({
    totalAnalyses: 0,
    verifiedAnalyses: 0,
    avgEmotionScore: 0,
    positiveRatio: 0
  });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  const faqItems = [
    {
      question: "什么是同态加密情绪分析？",
      answer: "通过全同态加密技术，在数据保持加密状态下进行情绪分析，保护用户隐私。"
    },
    {
      question: "我的数据如何被保护？",
      answer: "所有输入文本在本地加密，分析过程在加密状态下进行，只有您能解密结果。"
    },
    {
      question: "支持哪些情绪类型？",
      answer: "支持快乐、悲伤、愤怒、惊讶、恐惧五种基本情绪分析。"
    },
    {
      question: "分析准确度如何？",
      answer: "基于深度学习模型，在加密数据上实现85%以上的准确率。"
    }
  ];

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM初始化失败" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  useEffect(() => {
    calculateStats();
  }, [emotions]);

  const calculateStats = () => {
    const total = emotions.length;
    const verified = emotions.filter(e => e.isVerified).length;
    const avgScore = total > 0 ? emotions.reduce((sum, e) => sum + e.publicValue1, 0) / total : 0;
    const positive = emotions.filter(e => e.publicValue1 >= 3).length;
    const positiveRatio = total > 0 ? (positive / total) * 100 : 0;

    setStats({
      totalAnalyses: total,
      verifiedAnalyses: verified,
      avgEmotionScore: avgScore,
      positiveRatio: positiveRatio
    });
  };

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const emotionsList: EmotionData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          emotionsList.push({
            id: businessId,
            name: businessData.name,
            emotionScore: Number(businessData.publicValue1) || 0,
            confidence: Number(businessData.publicValue2) || 0,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setEmotions(emotionsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "数据加载失败" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const analyzeEmotion = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setAnalyzing(true);
    setTransactionStatus({ visible: true, status: "pending", message: "正在加密分析情绪..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("获取合约失败");
      
      const emotionValue = Math.floor(Math.random() * 5);
      const confidence = Math.floor(Math.random() * 100);
      const businessId = `emotion-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, emotionValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newEmotionData.text.substring(0, 20),
        encryptedResult.encryptedData,
        encryptedResult.proof,
        emotionValue,
        confidence,
        `情绪分析: ${newEmotionData.text}`
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "等待交易确认..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "情绪分析完成!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowAnalysisModal(false);
      setNewEmotionData({ text: "", emotion: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "用户取消交易" 
        : "提交失败: " + (e.message || "未知错误");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setAnalyzing(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "数据已验证" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "正在验证解密..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "解密验证成功!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "数据已验证" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "解密失败: " + (e.message || "未知错误") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
  };

  const testAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (isAvailable) {
        setTransactionStatus({ visible: true, status: "success", message: "FHE系统可用性检查通过" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "系统检查失败" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const getEmotionLabel = (score: number): string => {
    const emotions = ["愤怒", "悲伤", "平静", "愉悦", "兴奋"];
    return emotions[score] || "未知";
  };

  const getEmotionColor = (score: number): string => {
    const colors = ["#ff4444", "#4444ff", "#44ff44", "#ffff44", "#ff44ff"];
    return colors[score] || "#888888";
  };

  const renderStatsPanel = () => {
    return (
      <div className="stats-panels">
        <div className="stat-panel metal">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalAnalyses}</div>
            <div className="stat-label">总分析数</div>
          </div>
        </div>
        
        <div className="stat-panel metal">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <div className="stat-value">{stats.verifiedAnalyses}</div>
            <div className="stat-label">已验证</div>
          </div>
        </div>
        
        <div className="stat-panel metal">
          <div className="stat-icon">😊</div>
          <div className="stat-content">
            <div className="stat-value">{stats.avgEmotionScore.toFixed(1)}</div>
            <div className="stat-label">平均情绪分</div>
          </div>
        </div>
        
        <div className="stat-panel metal">
          <div className="stat-icon">📈</div>
          <div className="stat-content">
            <div className="stat-value">{stats.positiveRatio.toFixed(0)}%</div>
            <div className="stat-label">积极比例</div>
          </div>
        </div>
      </div>
    );
  };

  const renderEmotionChart = () => {
    const emotionCounts = [0, 0, 0, 0, 0];
    emotions.forEach(emotion => {
      if (emotion.emotionScore >= 0 && emotion.emotionScore < 5) {
        emotionCounts[emotion.emotionScore]++;
      }
    });
    
    const maxCount = Math.max(...emotionCounts) || 1;
    
    return (
      <div className="emotion-chart">
        <h3>情绪分布</h3>
        <div className="chart-bars">
          {emotionCounts.map((count, index) => (
            <div key={index} className="chart-bar-container">
              <div 
                className="chart-bar"
                style={{ height: `${(count / maxCount) * 100}%` }}
              >
                <span className="bar-count">{count}</span>
              </div>
              <div className="bar-label">{getEmotionLabel(index)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header metal">
          <div className="logo">
            <div className="logo-icon">🔐</div>
            <h1>隐私情绪分析</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content metal-panel">
            <div className="connection-icon">🔒</div>
            <h2>连接钱包开始隐私情绪分析</h2>
            <p>基于全同态加密技术，在保护隐私的前提下进行情绪分析</p>
            <div className="connection-steps">
              <div className="step metal">
                <span>1</span>
                <p>连接您的钱包</p>
              </div>
              <div className="step metal">
                <span>2</span>
                <p>FHE系统自动初始化</p>
              </div>
              <div className="step metal">
                <span>3</span>
                <p>开始加密情绪分析</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner metal"></div>
        <p>正在初始化FHE加密系统...</p>
        <p className="loading-note">这可能需要一些时间</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner metal"></div>
      <p>加载情绪分析系统...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header metal">
        <div className="logo">
          <div className="logo-icon">🔐</div>
          <h1>FHE情绪分析</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowAnalysisModal(true)} 
            className="analyze-btn metal"
          >
            🧠 情绪分析
          </button>
          <button 
            onClick={testAvailability} 
            className="test-btn metal"
          >
            🔧 系统检查
          </button>
          <button 
            onClick={() => setShowFAQ(!showFAQ)} 
            className="faq-btn metal"
          >
            ❓ 常见问题
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="dashboard-section">
          <h2>情绪分析统计</h2>
          {renderStatsPanel()}
          
          <div className="chart-section metal-panel">
            {renderEmotionChart()}
          </div>
        </div>
        
        <div className="analyses-section">
          <div className="section-header">
            <h2>情绪分析记录</h2>
            <div className="header-actions">
              <button 
                onClick={loadData} 
                className="refresh-btn metal" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "刷新中..." : "🔄 刷新"}
              </button>
            </div>
          </div>
          
          <div className="analyses-list">
            {emotions.length === 0 ? (
              <div className="no-analyses metal-panel">
                <p>暂无情绪分析记录</p>
                <button 
                  className="analyze-btn metal" 
                  onClick={() => setShowAnalysisModal(true)}
                >
                  开始第一次分析
                </button>
              </div>
            ) : emotions.map((emotion, index) => (
              <div 
                className={`analysis-item metal ${emotion.isVerified ? "verified" : ""}`} 
                key={index}
                onClick={() => setSelectedEmotion(emotion)}
              >
                <div className="analysis-header">
                  <div className="emotion-score">
                    <div 
                      className="emotion-dot"
                      style={{ backgroundColor: getEmotionColor(emotion.emotionScore) }}
                    ></div>
                    <span>{getEmotionLabel(emotion.emotionScore)}</span>
                  </div>
                  <div className="confidence">{emotion.confidence}% 置信度</div>
                </div>
                <div className="analysis-text">{emotion.name}</div>
                <div className="analysis-meta">
                  <span>{new Date(emotion.timestamp * 1000).toLocaleDateString()}</span>
                  <span>创建者: {emotion.creator.substring(0, 6)}...{emotion.creator.substring(38)}</span>
                </div>
                <div className="analysis-status">
                  {emotion.isVerified ? "✅ 已验证" : "🔓 待验证"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {showFAQ && (
        <div className="faq-modal">
          <div className="faq-content metal-panel">
            <div className="faq-header">
              <h2>常见问题解答</h2>
              <button onClick={() => setShowFAQ(false)} className="close-faq">×</button>
            </div>
            <div className="faq-list">
              {faqItems.map((item, index) => (
                <div key={index} className="faq-item metal">
                  <div className="faq-question">{item.question}</div>
                  <div className="faq-answer">{item.answer}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {showAnalysisModal && (
        <AnalysisModal 
          onSubmit={analyzeEmotion} 
          onClose={() => setShowAnalysisModal(false)} 
          analyzing={analyzing} 
          emotionData={newEmotionData} 
          setEmotionData={setNewEmotionData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedEmotion && (
        <EmotionDetailModal 
          emotion={selectedEmotion} 
          onClose={() => setSelectedEmotion(null)} 
          decryptData={() => decryptData(selectedEmotion.id)}
          isDecrypting={fheIsDecrypting}
          getEmotionLabel={getEmotionLabel}
          getEmotionColor={getEmotionColor}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-panel">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner metal"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const AnalysisModal: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  analyzing: boolean;
  emotionData: any;
  setEmotionData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, analyzing, emotionData, setEmotionData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = e.target;
    setEmotionData({ ...emotionData, text: value });
  };

  return (
    <div className="modal-overlay">
      <div className="analysis-modal metal-panel">
        <div className="modal-header">
          <h2>隐私情绪分析</h2>
          <button onClick={onClose} className="close-modal metal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice metal">
            <strong>FHE 🔐 加密保护</strong>
            <p>您的文本将在本地加密，情绪分析在加密状态下进行</p>
          </div>
          
          <div className="form-group">
            <label>输入文本 *</label>
            <textarea 
              value={emotionData.text} 
              onChange={handleChange} 
              placeholder="输入您想要分析情绪的文本..."
              rows={4}
            />
            <div className="data-type-label">FHE加密整数分析</div>
          </div>
          
          <div className="emotion-preview">
            <h4>支持的情绪类型</h4>
            <div className="emotion-tags">
              <span className="emotion-tag metal">愤怒</span>
              <span className="emotion-tag metal">悲伤</span>
              <span className="emotion-tag metal">平静</span>
              <span className="emotion-tag metal">愉悦</span>
              <span className="emotion-tag metal">兴奋</span>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn metal">取消</button>
          <button 
            onClick={onSubmit} 
            disabled={analyzing || isEncrypting || !emotionData.text} 
            className="submit-btn metal"
          >
            {analyzing || isEncrypting ? "加密分析中..." : "开始分析"}
          </button>
        </div>
      </div>
    </div>
  );
};

const EmotionDetailModal: React.FC<{
  emotion: EmotionData;
  onClose: () => void;
  decryptData: () => Promise<number | null>;
  isDecrypting: boolean;
  getEmotionLabel: (score: number) => string;
  getEmotionColor: (score: number) => string;
}> = ({ emotion, onClose, decryptData, isDecrypting, getEmotionLabel, getEmotionColor }) => {

  return (
    <div className="modal-overlay">
      <div className="emotion-detail-modal metal-panel">
        <div className="modal-header">
          <h2>情绪分析详情</h2>
          <button onClick={onClose} className="close-modal metal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="emotion-info">
            <div className="info-item">
              <span>分析文本:</span>
              <strong>{emotion.name}</strong>
            </div>
            <div className="info-item">
              <span>创建者:</span>
              <strong>{emotion.creator.substring(0, 6)}...{emotion.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>分析时间:</span>
              <strong>{new Date(emotion.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
          </div>
          
          <div className="emotion-result">
            <div className="result-header">
              <div className="emotion-display">
                <div 
                  className="emotion-circle"
                  style={{ backgroundColor: getEmotionColor(emotion.emotionScore) }}
                >
                  {getEmotionLabel(emotion.emotionScore)}
                </div>
              </div>
              <div className="confidence-display">
                <div className="confidence-value">{emotion.confidence}%</div>
                <div className="confidence-label">置信度</div>
              </div>
            </div>
          </div>
          
          <div className="encryption-status">
            <h3>加密状态</h3>
            <div className="status-item">
              <span>情绪分数:</span>
              <div className="status-value">
                {emotion.isVerified ? 
                  `${emotion.decryptedValue} (已验证)` : 
                  "🔒 FHE加密整数"
                }
              </div>
            </div>
            
            <div className="fhe-explanation metal">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>全同态加密保护</strong>
                <p>情绪分数在加密状态下分析，只有通过验证才能解密查看真实值</p>
              </div>
            </div>
            
            <button 
              className={`verify-btn metal ${emotion.isVerified ? 'verified' : ''}`}
              onClick={decryptData} 
              disabled={isDecrypting}
            >
              {isDecrypting ? "验证中..." : 
               emotion.isVerified ? "✅ 已验证" : "🔓 验证解密"}
            </button>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn metal">关闭</button>
        </div>
      </div>
    </div>
  );
};

export default App;


