// PDF 导出（v2.8.2）
// 基于 html2pdf.js 的纯客户端方案，把分析详情页渲染为 A4 PDF

const PDF_EXPORT = {
  async exportDetailView(bloggerData) {
    if (typeof html2pdf === 'undefined') {
      alert('PDF 导出组件未加载，请刷新页面后重试');
      return false;
    }

    const detailView = document.getElementById('detail-view');
    if (!detailView) return false;

    const btn = document.getElementById('btn-export-pdf');
    const originalText = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ 生成中...';
    }

    // 1) 添加导出 class — 关闭动画 + 隐藏交互元素
    detailView.classList.add('exporting-pdf');

    // 2) 临时固定宽度，避免 html2canvas 克隆时宽度计算偏差导致左侧裁切
    const container = detailView.closest('.container');
    const mainContent = detailView.closest('.main-content');
    const savedContainerStyle = container?.style.cssText || '';
    const savedMainStyle = mainContent?.style.cssText || '';
    const savedDetailStyle = detailView.style.cssText || '';

    const PDF_WIDTH = 900; // 固定渲染宽度（px）
    if (container) {
      container.style.cssText += `;max-width:${PDF_WIDTH}px !important;width:${PDF_WIDTH}px !important;padding-left:20px !important;padding-right:20px !important;display:block !important;`;
    }
    if (mainContent) {
      mainContent.style.cssText += `;width:100% !important;min-width:0 !important;`;
    }
    detailView.style.cssText += `;width:100% !important;overflow:visible !important;`;

    const safeName = (bloggerData?.nickname || 'blogger')
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 40);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${safeName}_数据分析_${dateStr}.pdf`;

    const startAt = Date.now();
    let success = false;

    try {
      // 等待图表重排 + 图片加载
      await new Promise(r => setTimeout(r, 1000));

      // 触发 ECharts resize（如果有图表的话）
      detailView.querySelectorAll('[_echarts_instance_]').forEach(el => {
        const chart = echarts?.getInstanceByDom?.(el);
        if (chart) chart.resize();
      });
      await new Promise(r => setTimeout(r, 300));

      await html2pdf()
        .set({
          margin: [12, 8, 14, 8],
          filename,
          image: { type: 'jpeg', quality: 0.92 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false,
            width: PDF_WIDTH,
            windowWidth: PDF_WIDTH,
            scrollX: 0,
            scrollY: 0,
            x: 0,
            y: 0,
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        })
        .from(detailView)
        .save();

      success = true;
    } catch (err) {
      console.error('[PDF] export failed:', err);
      alert('PDF 导出失败：' + (err?.message || err));
    } finally {
      // 恢复原始样式
      detailView.classList.remove('exporting-pdf');
      if (container) container.style.cssText = savedContainerStyle;
      if (mainContent) mainContent.style.cssText = savedMainStyle;
      detailView.style.cssText = savedDetailStyle;

      // 恢复图表尺寸
      detailView.querySelectorAll('[_echarts_instance_]').forEach(el => {
        const chart = echarts?.getInstanceByDom?.(el);
        if (chart) chart.resize();
      });

      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText || '📄 导出 PDF';
      }
      try {
        if (typeof ANALYTICS !== 'undefined') {
          ANALYTICS.track('pdf_export', {
            blogger_id: bloggerData?.userId || null,
            note_count: bloggerData?.notes?.length || 0,
            duration_ms: Date.now() - startAt,
            success,
          });
        }
      } catch {}
    }

    return success;
  },
};
