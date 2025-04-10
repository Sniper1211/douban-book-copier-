// ==UserScript==
// @name        豆瓣图书信息复制器
// @match       *://book.douban.com/subject/*
// ==/UserScript==

(function() {
  'use strict';

  // 添加样式
  const style = document.createElement('style');
  style.textContent = `
    .copy-btn-group {
      display: inline-flex;
      flex-direction: row;
      gap: 4px;
      margin-left: 8px;
      vertical-align: middle;
    }
    .copy-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: #007722;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
      margin: 0 2px;
    }
    .copy-btn:hover {
      opacity: 0.9;
      transform: scale(1.05);
      box-shadow: 0 1px 3px rgba(0,119,34,0.3);
    }
    /* 状态消息样式 */
    .loading, .success, .error {
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      padding: 4px 8px;
      border-radius: 4px;
      margin-top: 5px;
      text-align: center;
      font-size: 11px;
      white-space: nowrap;
      z-index: 100;
    }
    .loading { background: #f0f9ff; color: #007722; }
    .success { background: #e6ffe6; color: #009900; }
    .error { background: #ffe6e6; color: #cc0000; }
  `;
  document.head.appendChild(style);

  // 创建按钮容器
  let btnGroup = document.createElement('div');
  btnGroup.className = 'copy-btn-group';
  btnGroup.innerHTML = `
    <button class="copy-btn" id="copyText" title="复制图书信息">📋</button>
    <button class="copy-btn" id="copyImage" title="复制封面图片">🖼️</button>
  `;

  // 将按钮插入到书名后面
  const insertButtons = () => {
    const titleEl = document.querySelector('#wrapper h1 span');
    if (titleEl) {
      titleEl.insertAdjacentElement('afterend', btnGroup);
      return true;
    }
    return false;
  };

  // 尝试插入按钮，如果页面还没加载完成，则等待DOM加载后再尝试
  if (!insertButtons()) {
    window.addEventListener('DOMContentLoaded', insertButtons);
    // 如果DOMContentLoaded已经触发，使用MutationObserver监听DOM变化
    const observer = new MutationObserver((mutations, observer) => {
      if (insertButtons()) {
        observer.disconnect(); // 成功插入后停止观察
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // DOM观察器 - 确保按钮不被移除
  const btnObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      if (!document.contains(btnGroup)) {
        console.log('检测到容器被移除，重建按钮组');
        const newBtnGroup = btnGroup.cloneNode(true);
        btnGroup = newBtnGroup;
        insertButtons();
        addEventListeners();
      }
    });
  });
  btnObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // 防抖函数
  const debounce = (func, delay) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => func.apply(this, args), delay);
    };
  };

  // 元素查询函数
  const waitForElement = (selector, maxRetries = 3, interval = 500) => {
    return new Promise((resolve, reject) => {
      let retries = 0;
      const check = () => {
        const el = document.querySelector(selector);
        if (el) resolve(el);
        else if (retries++ < maxRetries) setTimeout(check, interval);
        else reject(new Error(`元素 ${selector} 未找到`));
      };
      check();
    });
  };

  // 获取封面图片
  const fetchCoverImage = () => {
    const img = document.querySelector('#mainpic img');
    return img ? img.src : null;
  };

  // 获取图书信息
  const getBookInfo = async () => {
    try {
      const titleEl = await waitForElement('#wrapper h1 span');
      const title = titleEl.innerText.replace(/\s+/g, ' ').trim();

      console.log('开始获取内容简介...');
      
      // 根据调试信息，直接获取.related_info .intro的第二个元素(索引1)作为内容简介
      const relatedInfoIntros = document.querySelectorAll('.related_info .intro');
      console.log('找到元素数量:', relatedInfoIntros.length);
      
      let introText = '暂无简介';
      
      // 如果存在索引为1的元素，则使用它
      if (relatedInfoIntros.length > 1) {
        const targetIntro = relatedInfoIntros[1]; // 获取索引为1的元素
        
        // 如果是容器元素，获取其中的段落
        const paragraphs = Array.from(targetIntro.querySelectorAll('p'));
        if (paragraphs.length > 0) {
          introText = paragraphs.map(p => p.textContent).join('\n');
        } else {
          // 如果没有段落，直接获取容器文本
          introText = targetIntro.textContent;
        }
        
        // 清理文本
        introText = introText
          .replace(/[\s\u3000\u200B]+/g, ' ')
          .replace(/(\（.*?\）|\[\d+\]|【.*?】|展开全部|更多→|\u00a0)/g, '')
          .trim();
          
        console.log(`获取到的内容简介: ${introText.substring(0, 50)}...`);
      } else {
        console.log('未找到目标内容简介元素');
      }
      
      return {
        title,
        desc: introText
      };
    } catch (error) {
      console.error('信息采集失败:', error);
      showMessage('error', `内容加载失败: ${error.message}`);
      return null;
    }
  };

  // 显示状态消息
  const showMessage = (type, text) => {
    const message = document.createElement('div');
    message.className = type;
    message.textContent = text;
    btnGroup.appendChild(message);
    setTimeout(() => message.remove(), 3000);
  };

  // 事件绑定函数
  const addEventListeners = () => {
    document.getElementById('copyText').addEventListener('click', async () => {
      const info = await getBookInfo();
      if (!info) return;

      try {
        await navigator.clipboard.writeText(`《${info.title}》\n\n${info.desc}`);
        showMessage('success', '文本复制成功！');
      } catch (err) {
        showMessage('error', '文本复制失败');
      }
    });

    document.getElementById('copyImage').addEventListener('click', async () => {
      try {
        showMessage('loading', '正在加载封面...');
        const imgUrl = fetchCoverImage();
        if (!imgUrl) throw new Error('封面地址获取失败');

        const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(imgUrl)}`);
        if (!response.ok) throw new Error(`HTTP错误: ${response.status}`);

        const blob = await response.blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        showMessage('success', '封面图已复制');
      } catch (err) {
        showMessage('error', `复制失败: ${err.message}`);
      }
    });
  };

  // 初始化事件监听
  addEventListeners();

  // 全局错误处理
  window.addEventListener('error', (e) => {
    console.error('脚本错误:', e);
    showMessage('error', `发生错误: ${e.message}`);
  });
  // 全局错误处理结束
})();