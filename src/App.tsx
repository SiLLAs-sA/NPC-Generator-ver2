/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Download, 
  Settings, 
  Archive, 
  RefreshCw, 
  Image as ImageIcon, 
  Type as TypeIcon,
  ChevronRight,
  Lock,
  Unlock,
  Check,
  X,
  Loader2,
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NPC, ArchiveNPC, ReferenceGroup } from './types';
import { extractNPCsFromText, generateNPCImage, generateTurnaroundImage, generateDetailItemImage } from './services/ai';
import { getApiKey, saveApiKey } from './lib/apiKey';
import { extractPalette } from './lib/colorUtils';
import { db } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn } from './lib/utils';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const STYLE_PRESETS = [
  '写实', '二次元', '赛璐璐', '概念原画', '像素', '水彩', '3D渲染', '暗黑奇幻'
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'generate' | 'archive' | 'settings'>('generate');
  const [apiKey, setApiKey] = useState(getApiKey());
  const [inputText, setInputText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [npcs, setNpcs] = useState<NPC[]>([]);
  const [isGenerating, setIsGenerating] = useState<Record<string, boolean>>({});
  const [addingTraitTo, setAddingTraitTo] = useState<string | null>(null);
  const [newTraitValue, setNewTraitValue] = useState('');
  const [selectedNpcIds, setSelectedNpcIds] = useState<Set<string>>(new Set());
  const [viewingArchiveNpcId, setViewingArchiveNpcId] = useState<string | null>(null);
  const [isGeneratingDetail, setIsGeneratingDetail] = useState(false);
  const [detailItemText, setDetailItemText] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showTurnaroundDeleteConfirm, setShowTurnaroundDeleteConfirm] = useState(false);
  const [detailDeleteIndex, setDetailDeleteIndex] = useState<number | null>(null);
  const [referenceGroups, setReferenceGroups] = useState<ReferenceGroup[]>([
    { id: crypto.randomUUID(), name: '角色 1 参考', images: [] }
  ]);
  
  const archivedNpcs = useLiveQuery(() => db.npcs.toArray());

  const viewingNpc = archivedNpcs?.find(n => n.id === viewingArchiveNpcId);

  useEffect(() => {
    if (viewingNpc && (!viewingNpc.palette || viewingNpc.palette.length === 0)) {
      refreshPalette(viewingNpc);
    }
    // Reset delete confirmation states when switching NPCs or closing
    setShowTurnaroundDeleteConfirm(false);
    setDetailDeleteIndex(null);
  }, [viewingArchiveNpcId, viewingNpc?.palette?.length]);

  const addReferenceGroup = () => {
    setReferenceGroups(prev => [
      ...prev,
      { id: crypto.randomUUID(), name: `角色 ${prev.length + 1} 参考`, images: [] }
    ]);
  };

  const removeReferenceGroup = (id: string) => {
    setReferenceGroups(prev => prev.filter(g => g.id !== id));
  };

  const handleReferenceImageUpload = (groupId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setReferenceGroups(prev => prev.map(g => {
        if (g.id === groupId) {
          if (g.images.length >= 2) {
            alert('每个角色组最多上传 2 张参考图');
            return g;
          }
          return { ...g, images: [...g.images, base64] };
        }
        return g;
      }));
    };
    reader.readAsDataURL(file);
  };

  const removeReferenceImage = (groupId: string, index: number) => {
    setReferenceGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        const nextImages = [...g.images];
        nextImages.splice(index, 1);
        return { ...g, images: nextImages };
      }
      return g;
    }));
  };

  const handleExtract = async () => {
    if (!inputText.trim()) return;
    setIsExtracting(true);
    try {
      const extracted = await extractNPCsFromText(inputText);
      const newNpcs: NPC[] = extracted.map((item: any) => ({
        id: crypto.randomUUID(),
        name: item.name,
        description: item.description,
        traits: item.traits,
        style: '写实',
        positivePrompt: '',
        negativePrompt: '低质量, 模糊, 畸形, 糟糕的解剖结构, 复杂背景, 阴影, 透视, 侧视图, 只有上半身',
        images: [],
        isLocked: false,
        originalInput: inputText,
        createdAt: Date.now()
      }));
      setNpcs(prev => [...prev, ...newNpcs]);
    } catch (error) {
      console.error(error);
    } finally {
      setIsExtracting(false);
    }
  };

  const updateNpc = (id: string, updates: Partial<NPC>) => {
    setNpcs(prev => prev.map(npc => npc.id === id ? { ...npc, ...updates } : npc));
  };

  const removeNpc = (id: string) => {
    setNpcs(prev => prev.filter(npc => npc.id !== id));
  };

  const handleGenerate = async (npc: NPC, baseImagesOverride?: string[]) => {
    console.log('Generating images for NPC:', npc.name);
    setIsGenerating(prev => ({ ...prev, [npc.id]: true }));
    try {
      const prompt = `A character portrait of ${npc.name}, ${npc.traits.join(', ')}, ${npc.style} style, high quality, highly detailed, concept art`;
      const baseImages = baseImagesOverride || npc.referenceImages;
      
      // Generate 4 images in parallel for variety
      const generationPromises = Array(4).fill(null).map(() => 
        generateNPCImage(prompt, npc.negativePrompt, baseImages)
      );
      
      const results = await Promise.all(generationPromises);
      const allImages = results.flat();
      
      updateNpc(npc.id, { images: allImages, positivePrompt: prompt });
    } catch (error) {
      console.error('生图失败:', error);
      alert('生成形象失败，请检查 API 配置或网络连接。');
    } finally {
      setIsGenerating(prev => ({ ...prev, [npc.id]: false }));
    }
  };

  const addToArchive = async (npc: NPC, imageIndex: number) => {
    try {
      const mainImage = npc.images[imageIndex];
      const palette = await extractPalette(mainImage);
      
      const archiveItem: ArchiveNPC = {
        ...npc,
        mainImage,
        selectedImageIndex: imageIndex,
        palette
      };
      await db.npcs.add(archiveItem);
      alert(`${npc.name} 已成功加入档案库。`);
    } catch (error) {
      console.error('收录失败:', error);
      alert('收录失败，该角色可能已存在。');
    }
  };

  const toggleSelectNpc = (id: string) => {
    setSelectedNpcIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllNpcs = () => {
    if (!archivedNpcs) return;
    if (selectedNpcIds.size === archivedNpcs.length) {
      setSelectedNpcIds(new Set());
    } else {
      setSelectedNpcIds(new Set(archivedNpcs.map(npc => npc.id)));
    }
  };

  const exportSelectedToExcel = async () => {
    if (selectedNpcIds.size === 0 || !archivedNpcs) {
      return;
    }

    const selectedNpcs = archivedNpcs.filter(npc => selectedNpcIds.has(npc.id));
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('NPC 档案');

    worksheet.columns = [
      { header: '名称', key: 'name', width: 20 },
      { header: '描述', key: 'description', width: 40 },
      { header: '特征标签', key: 'traits', width: 40 },
      { header: '风格', key: 'style', width: 15 },
      { header: '原始提示词', key: 'originalInput', width: 50 },
      { header: '创建时间', key: 'createdAt', width: 25 },
      { header: '主视图', key: 'mainImage', width: 30 },
      { header: '三视图', key: 'turnaroundImage', width: 30 },
      { header: '细节图1', key: 'detail1', width: 30 },
      { header: '细节图2', key: 'detail2', width: 30 },
      { header: '细节图3', key: 'detail3', width: 30 },
    ];

    selectedNpcs.forEach((npc, index) => {
      const rowIndex = index + 2;
      const row = worksheet.addRow({
        name: npc.name,
        description: npc.description,
        traits: npc.traits.join(', '),
        style: npc.style,
        originalInput: npc.originalInput || '',
        createdAt: new Date(npc.createdAt).toLocaleString(),
      });
      
      row.height = 160;
      row.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

      const addImageToCell = (base64: string | undefined, colIndex: number) => {
        if (!base64) return;
        try {
          const imageId = workbook.addImage({
            base64: base64,
            extension: 'png',
          });
          worksheet.addImage(imageId, {
            tl: { col: colIndex, row: rowIndex - 1 },
            ext: { width: 200, height: 200 }
          });
        } catch (e) {
          console.error('Excel 图像导出失败:', e);
        }
      };

      addImageToCell(npc.mainImage, 6);
      addImageToCell(npc.turnaroundImage, 7);
      if (npc.detailImages) {
        npc.detailImages.slice(0, 3).forEach((img, i) => {
          addImageToCell(img, 8 + i);
        });
      }
    });

    // Styling headers
    worksheet.getRow(1).height = 30;
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF000000' }
    };
    worksheet.getRow(1).eachCell(cell => {
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `NPC_Archive_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleDeleteSelected = async () => {
    if (selectedNpcIds.size === 0) return;
    try {
      await db.npcs.bulkDelete(Array.from(selectedNpcIds));
      setSelectedNpcIds(new Set());
      setShowBulkDeleteConfirm(false);
    } catch (error) {
      console.error('批量删除失败:', error);
    }
  };

  const handleGenerateTurnaround = async (npc: ArchiveNPC) => {
    setIsGeneratingDetail(true);
    try {
      const turnaround = await generateTurnaroundImage(npc.mainImage, npc.positivePrompt);
      if (turnaround) {
        await db.npcs.update(npc.id!, { turnaroundImage: turnaround });
      }
    } catch (error) {
      console.error(error);
      alert('生成三视图失败');
    } finally {
      setIsGeneratingDetail(false);
    }
  };

  const handleDeleteTurnaround = async (npc: ArchiveNPC) => {
    try {
      await db.npcs.update(npc.id!, { turnaroundImage: undefined });
      setShowTurnaroundDeleteConfirm(false);
    } catch (error) {
      console.error('删除失败:', error);
    }
  };

  const handleDeleteDetailImage = async (npc: ArchiveNPC, index: number) => {
    try {
      const currentDetails = [...(npc.detailImages || [])];
      currentDetails.splice(index, 1);
      await db.npcs.update(npc.id!, { detailImages: currentDetails });
      setDetailDeleteIndex(null);
    } catch (error) {
      console.error('删除失败:', error);
    }
  };

  const handleGenerateDetailItem = async (npc: ArchiveNPC) => {
    if (!detailItemText.trim()) return;
    setIsGeneratingDetail(true);
    try {
      const detailImage = await generateDetailItemImage(detailItemText, npc.style, npc.mainImage);
      if (detailImage) {
        const currentDetails = npc.detailImages || [];
        await db.npcs.update(npc.id!, { detailImages: [...currentDetails, detailImage] });
        setDetailItemText('');
      }
    } catch (error) {
      console.error(error);
      alert('生成细节图失败');
    } finally {
      setIsGeneratingDetail(false);
    }
  };

  const refreshPalette = async (npc: ArchiveNPC) => {
    try {
      const palette = await extractPalette(npc.mainImage);
      await db.npcs.update(npc.id!, { palette });
    } catch (error) {
      console.error('提取配色失败:', error);
    }
  };

  const exportAllExtractedToExcel = async () => {
    if (npcs.length === 0) return;
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('提取的 NPC');

    worksheet.columns = [
      { header: '名称', key: 'name', width: 20 },
      { header: '描述', key: 'description', width: 40 },
      { header: '特征标签', key: 'traits', width: 40 },
      { header: '风格', key: 'style', width: 15 },
      { header: '原始提示词', key: 'originalInput', width: 50 },
      { header: '预览图', key: 'preview', width: 30 },
    ];

    npcs.forEach((npc, index) => {
      const rowIndex = index + 2;
      const row = worksheet.addRow({
        name: npc.name,
        description: npc.description,
        traits: npc.traits.join(', '),
        style: npc.style,
        originalInput: npc.originalInput || '',
      });
      
      row.height = 160;
      row.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

      if (npc.images && npc.images.length > 0) {
        const img = npc.selectedImageIndex !== undefined ? npc.images[npc.selectedImageIndex] : npc.images[0];
        try {
          const imageId = workbook.addImage({
            base64: img,
            extension: 'png',
          });
          worksheet.addImage(imageId, {
            tl: { col: 5, row: rowIndex - 1 },
            ext: { width: 200, height: 200 }
          });
        } catch (e) {
          console.error('Excel 预览图导出失败:', e);
        }
      }
    });

    worksheet.getRow(1).height = 30;
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF000000' }
    };
    worksheet.getRow(1).eachCell(cell => {
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `NPC_Extracted_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header / Navigation */}
      <header className="border-b border-black p-6 flex justify-between items-center sticky top-0 bg-white z-50">
        <div>
          <h1 className="text-4xl leading-none">NPC 形象生成工具</h1>
        </div>
        <nav className="flex gap-8">
          {[
            { id: 'generate', label: '生成', icon: RefreshCw },
            { id: 'archive', label: '档案库', icon: Archive },
            { id: 'settings', label: '设置', icon: Settings },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 text-sm font-bold uppercase tracking-tighter transition-all",
                activeTab === tab.id ? "underline underline-offset-8" : "opacity-40 hover:opacity-100"
              )}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 p-6">
        <AnimatePresence mode="wait">
          {activeTab === 'generate' && (
            <motion.div
              key="generate"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-12"
            >
              {/* Input Section */}
              <section className="border border-black p-0">
                <div className="bg-black text-white p-2 text-xs font-bold uppercase flex justify-between items-center">
                  <span>源文本输入</span>
                  <span className="font-mono">01 / 输入</span>
                </div>
                <div className="p-4 space-y-4">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="请在此粘贴剧本、角色描述或世界观文档..."
                    className="w-full h-48 p-4 font-mono text-sm border-none bg-gray-50 focus:outline-none resize-none"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleExtract}
                      disabled={isExtracting || !inputText.trim()}
                      className="swiss-button flex items-center gap-2"
                    >
                      {isExtracting ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                      提取 NPC
                    </button>
                  </div>
                </div>

                {/* Reference Images Section */}
                <div className="border-t border-black p-4 bg-gray-50 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                      <ImageIcon size={14} />
                      角色生成参考图组 (辅助 AI 生成)
                    </h3>
                    <button 
                      onClick={addReferenceGroup}
                      className="text-[10px] font-bold uppercase underline flex items-center gap-1 hover:opacity-70"
                    >
                      <Plus size={12} />
                      增加角色组
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {referenceGroups.map((group, gIdx) => (
                      <div key={group.id} className="border border-black bg-white p-3 space-y-3">
                        <div className="flex justify-between items-center">
                          <input 
                            type="text" 
                            value={group.name}
                            onChange={(e) => setReferenceGroups(prev => prev.map(g => g.id === group.id ? { ...g, name: e.target.value } : g))}
                            className="text-[10px] font-bold uppercase w-full bg-transparent border-none focus:outline-none"
                          />
                          {referenceGroups.length > 1 && (
                            <button onClick={() => removeReferenceGroup(group.id)} className="text-red-600 hover:opacity-70">
                              <X size={12} />
                            </button>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                          {group.images.map((img, iIdx) => (
                            <div key={iIdx} className="aspect-square border border-black relative group">
                              <img src={img} className="w-full h-full object-cover" alt="Ref" />
                              <button 
                                onClick={() => removeReferenceImage(group.id, iIdx)}
                                className="absolute top-1 right-1 bg-white border border-black p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ))}
                          {group.images.length < 2 && (
                            <label className="aspect-square border border-dashed border-black flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors">
                              <Upload size={16} className="opacity-30" />
                              <span className="text-[8px] uppercase font-mono mt-1 opacity-40">上传参考</span>
                              <input 
                                type="file" 
                                className="hidden" 
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleReferenceImageUpload(group.id, file);
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* NPC List */}
              {npcs.length > 0 && (
                <section className="space-y-6">
                  <div className="flex justify-between items-end border-b border-black pb-2">
                    <h2 className="text-2xl">已提取实体 ({npcs.length})</h2>
                    <button onClick={exportAllExtractedToExcel} className="text-xs font-bold uppercase underline">全部导出为 Excel</button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {npcs.map((npc) => (
                      <div key={npc.id} className="border border-black flex flex-col">
                          <div className="flex justify-between items-center border-b border-black p-3 bg-gray-50">
                            <span className="font-black uppercase tracking-tighter">{npc.name}</span>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(npc.positivePrompt || `A character portrait of ${npc.name}, ${npc.traits.join(', ')}, ${npc.style} 风格`);
                                  alert('提示词已复制到剪贴板');
                                }}
                                className="text-gray-400 hover:text-black transition-colors"
                                title="复制提示词"
                              >
                                <Download size={16} />
                              </button>
                              <button onClick={() => removeNpc(npc.id)} className="text-gray-400 hover:text-red-600 transition-colors">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        
                        <div className="p-4 space-y-4 flex-1">
                          <div>
                            <label className="swiss-label">角色描述</label>
                            <p className="text-sm text-gray-600 italic">{npc.description || '暂无描述。'}</p>
                          </div>
                          
                          <div>
                            <label className="swiss-label">特征标签</label>
                            <div className="flex flex-wrap gap-2">
                              {npc.traits.map((trait, i) => (
                                <span 
                                  key={i} 
                                  onClick={() => {
                                    const newTraits = npc.traits.filter((_, idx) => idx !== i);
                                    updateNpc(npc.id, { traits: newTraits });
                                  }}
                                  className="px-2 py-1 bg-black text-white text-[10px] uppercase font-bold cursor-pointer hover:bg-red-600 transition-colors flex items-center gap-1 group"
                                  title="点击删除"
                                >
                                  {trait}
                                  <X size={8} className="opacity-0 group-hover:opacity-100" />
                                </span>
                              ))}
                              {addingTraitTo === npc.id ? (
                                <div className="flex items-center gap-1 animate-in fade-in slide-in-from-left-2 duration-200 relative z-20">
                                  <input
                                    autoFocus
                                    type="text"
                                    value={newTraitValue}
                                    onChange={(e) => setNewTraitValue(e.target.value)}
                                    onBlur={() => {
                                      // Delay to allow clicking the confirm button
                                      setTimeout(() => {
                                        if (addingTraitTo === npc.id) {
                                          setAddingTraitTo(null);
                                          setNewTraitValue('');
                                        }
                                      }, 200);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        if (newTraitValue.trim()) {
                                          updateNpc(npc.id, { traits: [...npc.traits, newTraitValue.trim()] });
                                        }
                                        setAddingTraitTo(null);
                                        setNewTraitValue('');
                                      } else if (e.key === 'Escape') {
                                        setAddingTraitTo(null);
                                        setNewTraitValue('');
                                      }
                                    }}
                                    className="px-2 py-1 border-2 border-black text-[10px] uppercase font-black w-40 focus:outline-none bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                                    placeholder="输入新特征..."
                                  />
                                  <button 
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault(); // Prevent blur
                                      if (newTraitValue.trim()) {
                                        updateNpc(npc.id, { traits: [...npc.traits, newTraitValue.trim()] });
                                      }
                                      setAddingTraitTo(null);
                                      setNewTraitValue('');
                                    }}
                                    className="p-1.5 bg-black text-white hover:bg-gray-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                                  >
                                    <Check size={12} />
                                  </button>
                                  <button 
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault(); // Prevent blur
                                      setAddingTraitTo(null);
                                      setNewTraitValue('');
                                    }}
                                    className="p-1.5 border-2 border-black hover:bg-gray-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none bg-white"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              ) : (
                                <button 
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    console.log('Add trait button clicked for NPC:', npc.id);
                                    setAddingTraitTo(npc.id);
                                  }}
                                  className="px-4 py-1.5 border-2 border-black text-[10px] uppercase font-black hover:bg-black hover:text-white transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none flex items-center gap-1 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                                >
                                  <Plus size={12} />
                                  添加特征
                                </button>
                              )}
                            </div>
                          </div>

                          <div>
                            <label className="swiss-label flex items-center gap-2">
                              <ImageIcon size={12} />
                              关联参考图组 (辅助 AI 生成)
                            </label>
                            <div className="space-y-2">
                              <select 
                                value={npc.referenceGroupId || ''}
                                onChange={(e) => {
                                  const groupId = e.target.value;
                                  const group = referenceGroups.find(g => g.id === groupId);
                                  updateNpc(npc.id, { 
                                    referenceGroupId: groupId || undefined,
                                    referenceImages: group ? group.images : [] 
                                  });
                                }}
                                className="w-full text-[10px] font-bold uppercase border border-black p-2 focus:outline-none bg-white"
                              >
                                <option value="">不使用参考图组</option>
                                {referenceGroups.map(group => (
                                  <option key={group.id} value={group.id}>{group.name} ({group.images.length} 张图)</option>
                                ))}
                              </select>
                              
                              {npc.referenceImages && npc.referenceImages.length > 0 && (
                                <div className="flex gap-2">
                                  {npc.referenceImages.map((img, idx) => (
                                    <div key={idx} className="w-12 h-12 border border-black relative group">
                                      <img src={img} alt="Ref" className="w-full h-full object-cover" />
                                    </div>
                                  ))}
                                  <span className="text-[9px] text-gray-400 uppercase leading-tight flex items-center">
                                    已关联参考图组，生图将基于这些图进行修改
                                  </span>
                                </div>
                              )}
                              
                              {(!npc.referenceImages || npc.referenceImages.length === 0) && (
                                <div className="flex gap-2 items-center">
                                  <label className="w-12 h-12 border border-black border-dashed flex items-center justify-center cursor-pointer hover:bg-gray-50 shrink-0">
                                    <Upload size={14} />
                                    <input 
                                      type="file" 
                                      accept="image/*"
                                      className="hidden" 
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          const reader = new FileReader();
                                          reader.onloadend = () => {
                                            updateNpc(npc.id, { referenceImages: [reader.result as string] });
                                          };
                                          reader.readAsDataURL(file);
                                        }
                                      }}
                                    />
                                  </label>
                                  <span className="text-[9px] text-gray-400 uppercase leading-tight">
                                    或上传单张参考图进行“图生图”修改
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div>
                            <label className="swiss-label">生图风格</label>
                            <div className="grid grid-cols-4 gap-1">
                              {STYLE_PRESETS.map(s => (
                                <button
                                  key={s}
                                  onClick={() => updateNpc(npc.id, { style: s })}
                                  className={cn(
                                    "text-[10px] uppercase font-bold p-1 border",
                                    npc.style === s ? "bg-black text-white border-black" : "border-gray-200 hover:border-black"
                                  )}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="pt-4 border-t border-black">
                            {npc.images.length > 0 ? (
                              <div className="space-y-4">
                                <div className="flex justify-between items-end">
                                  <label className="swiss-label">生成结果 (点击图标收录)</label>
                                  <button 
                                    onClick={() => {
                                      npc.images.forEach((_, i) => addToArchive(npc, i));
                                      alert('已将所有图片加入档案库');
                                    }}
                                    className="text-[10px] font-bold uppercase underline"
                                  >
                                    全部收录
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  {npc.images.map((img, i) => (
                                    <div key={i} className="relative group aspect-square border border-black bg-gray-100 overflow-hidden">
                                      <img src={img} alt="" className="w-full h-full object-cover" />
                                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <button 
                                          onClick={() => addToArchive(npc, i)}
                                          className="bg-white text-black p-2 hover:bg-gray-200"
                                          title="收录到档案库"
                                        >
                                          <Archive size={16} />
                                        </button>
                                        <button 
                                          onClick={() => updateNpc(npc.id, { referenceImages: [img] })}
                                          className="bg-white text-black p-2 hover:bg-gray-200"
                                          title="设为参考图进行重绘"
                                        >
                                          <RefreshCw size={16} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <button
                                  onClick={() => handleGenerate(npc)}
                                  disabled={isGenerating[npc.id]}
                                  className="w-full swiss-button flex items-center justify-center gap-2 py-3"
                                >
                                  {isGenerating[npc.id] ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                                  重新生成 (4张)
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleGenerate(npc)}
                                disabled={isGenerating[npc.id]}
                                className="w-full swiss-button flex items-center justify-center gap-2 py-6"
                              >
                                {isGenerating[npc.id] ? <Loader2 className="animate-spin" size={24} /> : <ImageIcon size={24} />}
                                生成形象 (一次生成4张)
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </motion.div>
          )}

          {activeTab === 'archive' && (
            <motion.div
              key="archive"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-black pb-4 gap-4">
                <div className="space-y-1">
                  <h2 className="text-2xl">角色档案库</h2>
                  <p className="text-[10px] font-mono uppercase opacity-60">共找到 {archivedNpcs?.length || 0} 条记录 | 已选择 {selectedNpcIds.size} 条</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={selectAllNpcs}
                    className="px-4 py-2 border border-black text-[10px] uppercase font-bold hover:bg-black hover:text-white transition-all"
                  >
                    {archivedNpcs && selectedNpcIds.size === archivedNpcs.length ? '取消全选' : '全选'}
                  </button>
                  
                  {showBulkDeleteConfirm ? (
                    <div className="flex items-center gap-2 px-4 py-2 border border-red-600 bg-red-50 animate-in fade-in slide-in-from-right-2">
                      <span className="text-[10px] font-bold text-red-600 uppercase">确定删除 {selectedNpcIds.size} 项?</span>
                      <button onClick={handleDeleteSelected} className="text-[10px] font-black uppercase text-red-600 hover:underline">确认</button>
                      <button onClick={() => setShowBulkDeleteConfirm(false)} className="text-[10px] font-black uppercase text-gray-500 hover:underline">取消</button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setShowBulkDeleteConfirm(true)}
                      disabled={selectedNpcIds.size === 0}
                      className="px-4 py-2 border border-black text-[10px] uppercase font-bold hover:bg-red-600 hover:text-white hover:border-red-600 transition-all disabled:opacity-20 flex items-center gap-2"
                    >
                      <Trash2 size={14} />
                      删除所选
                    </button>
                  )}

                  <button 
                    onClick={exportSelectedToExcel}
                    disabled={selectedNpcIds.size === 0}
                    className="swiss-button flex items-center gap-2 text-[10px]"
                  >
                    <Download size={14} />
                    导出所选到 EXCEL
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-0 border-t border-l border-black">
                {archivedNpcs?.map((npc) => (
                  <div 
                    key={npc.id} 
                    className={cn(
                      "border-r border-b border-black group relative transition-colors",
                      selectedNpcIds.has(npc.id) ? "bg-gray-50" : "bg-white"
                    )}
                  >
                    {/* Selection Checkbox */}
                    <div className="absolute top-3 left-3 z-10">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectNpc(npc.id);
                        }}
                        className={cn(
                          "w-5 h-5 border-2 border-black flex items-center justify-center transition-all",
                          selectedNpcIds.has(npc.id) ? "bg-black text-white" : "bg-white hover:bg-gray-100"
                        )}
                      >
                        {selectedNpcIds.has(npc.id) && <Check size={14} strokeWidth={4} />}
                      </button>
                    </div>

                    <div 
                      className="aspect-[3/4] bg-gray-100 overflow-hidden border-b border-black cursor-pointer"
                      onClick={() => setViewingArchiveNpcId(npc.id)}
                    >
                      <img src={npc.mainImage} alt={npc.name} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                    </div>
                    <div className="p-4 space-y-2">
                      <div className="flex justify-between items-start">
                        <h3 className="text-lg leading-none font-black uppercase tracking-tighter">{npc.name}</h3>
                        
                        {deleteConfirmId === npc.id ? (
                          <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                db.npcs.delete(npc.id!);
                                setDeleteConfirmId(null);
                              }} 
                              className="text-[10px] font-black uppercase text-red-600 hover:underline"
                            >
                              确认
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmId(null);
                              }} 
                              className="text-[10px] font-black uppercase text-gray-400 hover:underline"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(npc.id!);
                            }} 
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] font-mono uppercase opacity-60">风格: {npc.style}</p>
                      <div className="flex flex-wrap gap-1">
                        {npc.traits.slice(0, 3).map((t, i) => (
                          <span key={i} className="text-[9px] border border-black px-1 uppercase font-bold">{t}</span>
                        ))}
                        {npc.traits.length > 3 && <span className="text-[9px] opacity-40">+{npc.traits.length - 3}</span>}
                      </div>
                    </div>
                  </div>
                ))}
                {(!archivedNpcs || archivedNpcs.length === 0) && (
                  <div className="col-span-full py-24 text-center border-r border-b border-black">
                    <p className="text-sm font-mono uppercase opacity-40 italic">档案库暂无记录。</p>
                  </div>
                )}
              </div>

              {/* NPC Detail Modal */}
              <AnimatePresence>
                {viewingArchiveNpcId && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-white w-full max-w-5xl max-h-[90vh] overflow-y-auto border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
                    >
                      {(() => {
                        const npc = archivedNpcs?.find(n => n.id === viewingArchiveNpcId);
                        if (!npc) return null;
                        return (
                          <div className="flex flex-col">
                            <div className="p-6 border-b border-black flex justify-between items-center sticky top-0 bg-white z-10">
                              <div className="space-y-1">
                                <h3 className="text-3xl font-black uppercase tracking-tighter">{npc.name}</h3>
                                <p className="text-xs font-mono uppercase opacity-60">角色档案详情 // {npc.style} 风格</p>
                              </div>
                              <button 
                                onClick={() => setViewingArchiveNpcId(null)}
                                className="p-2 hover:bg-gray-100 border border-black"
                              >
                                <X size={24} />
                              </button>
                            </div>

                            <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-12">
                              {/* Left: Visual Assets */}
                              <div className="space-y-8">
                                <div className="space-y-4">
                                  <label className="swiss-label">主视图 (正视图)</label>
                                  <div className="border border-black aspect-[3/4] bg-gray-50">
                                    <img src={npc.mainImage} alt="Main" className="w-full h-full object-cover" />
                                  </div>
                                </div>

                                <div className="space-y-4">
                                  <div className="flex justify-between items-end">
                                    <label className="swiss-label">三视图 / 角色转面图</label>
                                    <div className="flex gap-3">
                                      {npc.turnaroundImage && (
                                        <>
                                          {!showTurnaroundDeleteConfirm ? (
                                            <>
                                              <button 
                                                onClick={() => handleGenerateTurnaround(npc)}
                                                disabled={isGeneratingDetail}
                                                className="text-[10px] font-bold uppercase underline disabled:opacity-40 flex items-center gap-1"
                                              >
                                                <RefreshCw size={10} className={isGeneratingDetail ? 'animate-spin' : ''} />
                                                {isGeneratingDetail ? '生成中...' : '重新生成'}
                                              </button>
                                              <button 
                                                onClick={() => setShowTurnaroundDeleteConfirm(true)}
                                                className="text-[10px] font-bold uppercase underline text-red-600 flex items-center gap-1"
                                              >
                                                <Trash2 size={10} />
                                                删除
                                              </button>
                                            </>
                                          ) : (
                                            <div className="flex items-center gap-2 bg-red-50 px-2 py-1 border border-red-200">
                                              <span className="text-[9px] font-bold text-red-600 uppercase">确认删除?</span>
                                              <button 
                                                onClick={() => handleDeleteTurnaround(npc)}
                                                className="text-[9px] font-black uppercase underline text-red-700"
                                              >
                                                是
                                              </button>
                                              <button 
                                                onClick={() => setShowTurnaroundDeleteConfirm(false)}
                                                className="text-[9px] font-black uppercase underline text-gray-500"
                                              >
                                                否
                                              </button>
                                            </div>
                                          )}
                                        </>
                                      )}
                                      {!npc.turnaroundImage && (
                                        <button 
                                          onClick={() => handleGenerateTurnaround(npc)}
                                          disabled={isGeneratingDetail}
                                          className="text-[10px] font-bold uppercase underline disabled:opacity-40"
                                        >
                                          {isGeneratingDetail ? '生成中...' : '一键生成三视图'}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div className="border border-black aspect-[16/9] bg-gray-50 flex items-center justify-center overflow-hidden">
                                    {npc.turnaroundImage ? (
                                      <img src={npc.turnaroundImage} alt="Turnaround" className="w-full h-full object-contain" />
                                    ) : (
                                      <div className="text-center space-y-2 opacity-30">
                                        <RefreshCw size={32} className="mx-auto" />
                                        <p className="text-[10px] uppercase font-mono">暂无三视图</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Right: Info & Details */}
                              <div className="space-y-8">
                                <div className="space-y-4">
                                  <div className="flex justify-between items-end">
                                    <label className="swiss-label">角色配色方案 (Color Palette)</label>
                                    <button 
                                      onClick={() => refreshPalette(npc)}
                                      className="text-[10px] font-bold uppercase underline flex items-center gap-1"
                                    >
                                      <RefreshCw size={10} />
                                      重新提取
                                    </button>
                                  </div>
                                  <div className="flex gap-2">
                                    {npc.palette && npc.palette.length > 0 ? (
                                      npc.palette.map((color, i) => (
                                        <div key={i} className="flex-1 group relative">
                                          <div 
                                            className="h-12 border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" 
                                            style={{ backgroundColor: color }}
                                          />
                                          <div className="mt-1 text-[9px] font-mono uppercase text-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            {color}
                                          </div>
                                        </div>
                                      ))
                                    ) : (
                                      <div className="w-full py-4 text-center border border-dashed border-black opacity-30 flex flex-col items-center gap-2">
                                        <p className="text-[10px] uppercase font-mono">暂无配色数据</p>
                                        <button 
                                          onClick={() => refreshPalette(npc)}
                                          className="text-[9px] font-black uppercase underline hover:opacity-100"
                                        >
                                          点击立即分析图片配色
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="space-y-4">
                                  <label className="swiss-label">角色描述</label>
                                  <p className="text-sm leading-relaxed">{npc.description}</p>
                                </div>

                                <div className="space-y-4">
                                  <label className="swiss-label">特征标签</label>
                                  <div className="flex flex-wrap gap-2">
                                    {npc.traits.map((t, i) => (
                                      <span key={i} className="px-2 py-1 border border-black text-xs uppercase font-bold">{t}</span>
                                    ))}
                                  </div>
                                </div>

                                <div className="space-y-6 pt-6 border-t border-black">
                                  <div className="space-y-4">
                                    <label className="swiss-label">生成角色锚点细节 (道具/饰品)</label>
                                    <div className="flex gap-2">
                                      <input 
                                        type="text"
                                        value={detailItemText}
                                        onChange={(e) => setDetailItemText(e.target.value)}
                                        placeholder="例如：珍视的玉佩，上有龙纹"
                                        className="flex-1 px-4 py-2 border border-black text-sm focus:outline-none"
                                      />
                                      <button 
                                        onClick={() => handleGenerateDetailItem(npc)}
                                        disabled={isGeneratingDetail || !detailItemText.trim()}
                                        className="swiss-button px-6 disabled:opacity-40"
                                      >
                                        {isGeneratingDetail ? <Loader2 className="animate-spin" size={18} /> : '生成细节'}
                                      </button>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-3 gap-4">
                                    {npc.detailImages?.map((img, i) => (
                                      <div key={i} className="border border-black aspect-square bg-gray-50 relative group">
                                        <img src={img} alt={`Detail ${i}`} className="w-full h-full object-cover" />
                                        {detailDeleteIndex !== i ? (
                                          <button 
                                            onClick={() => setDetailDeleteIndex(i)}
                                            className="absolute top-1 right-1 p-1 bg-white border border-black opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                                          >
                                            <Trash2 size={12} className="text-red-600" />
                                          </button>
                                        ) : (
                                          <div className="absolute inset-0 bg-red-600/90 flex flex-col items-center justify-center p-2 text-center">
                                            <p className="text-[10px] font-black text-white uppercase mb-2">确认删除?</p>
                                            <div className="flex gap-3">
                                              <button 
                                                onClick={() => handleDeleteDetailImage(npc, i)}
                                                className="text-[10px] font-black text-white underline uppercase"
                                              >
                                                是
                                              </button>
                                              <button 
                                                onClick={() => setDetailDeleteIndex(null)}
                                                className="text-[10px] font-black text-white/70 underline uppercase"
                                              >
                                                否
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                    {(!npc.detailImages || npc.detailImages.length === 0) && (
                                      <div className="col-span-full py-8 text-center border border-dashed border-black opacity-30">
                                        <p className="text-[10px] uppercase font-mono">暂无细节图</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-2xl space-y-12"
            >
              <section className="space-y-6">
                <h2 className="text-2xl border-b border-black pb-2">API 配置</h2>
                <div className="space-y-4">
                  <div>
                    <label className="swiss-label">Gemini API Key</label>
                    <div className="flex gap-2">
                      <input 
                        type="password" 
                        value={apiKey} 
                        onChange={(e) => {
                          const newKey = e.target.value;
                          setApiKey(newKey);
                          saveApiKey(newKey);
                        }}
                        placeholder="在此输入您的 Gemini API Key..."
                        className="swiss-input" 
                      />
                      {apiKey && (
                        <button 
                          onClick={() => {
                            setApiKey('');
                            saveApiKey('');
                          }}
                          className="px-4 border border-black hover:bg-red-50 text-red-600"
                        >
                          清除
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] mt-1 text-gray-500 uppercase">
                      {process.env.GEMINI_API_KEY ? "已检测到系统环境变量，您可以在此覆盖它。" : "请在此输入您的 API Key 以启用 AI 功能。"}
                    </p>
                  </div>
                  <div>
                    <label className="swiss-label">默认生图引擎</label>
                    <select className="swiss-input">
                      <option>Gemini 2.5 Flash Image</option>
                      <option>DALL·E 3 (需要 OpenAI Key)</option>
                    </select>
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <h2 className="text-2xl border-b border-black pb-2">系统偏好</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border border-black">
                    <div>
                      <span className="font-bold uppercase block">自动锁定种子 (Seed)</span>
                      <span className="text-[10px] text-gray-500 uppercase">始终使用相同的种子以保持角色一致性。</span>
                    </div>
                    <div className="w-12 h-6 bg-black flex items-center px-1">
                      <div className="w-4 h-4 bg-white" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 border border-black">
                    <div>
                      <span className="font-bold uppercase block">高密度模式</span>
                      <span className="text-[10px] text-gray-500 uppercase">在档案库中每行显示更多角色。</span>
                    </div>
                    <div className="w-12 h-6 bg-gray-200 flex items-center justify-end px-1">
                      <div className="w-4 h-4 bg-white" />
                    </div>
                  </div>
                </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Status Bar */}
      <footer className="border-t border-black p-2 flex justify-between items-center bg-black text-white text-[10px] font-mono uppercase tracking-widest">
        <div className="flex gap-4">
          <span>状态: 在线</span>
          <span>引擎: Gemini 2.5 Flash</span>
        </div>
        <div>
          <span>© 2026 NPC 形象生成系统</span>
        </div>
      </footer>
    </div>
  );
}
