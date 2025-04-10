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
      position: fixed !important;
      left: 30px;
      top: 30px;
      z-index: 2147483647 !important;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 120px;
      backdrop-filter: blur(5px);
      border: 2px solid #007722;
      background: rgba(255,255,255,0.95);
      padding: 20px;
      animation: fadeIn 0.5s ease-out;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,119,34,0.3);
      isolation: isolate;
      mix-blend-mode: normal;
      pointer-events: auto;
      cursor: move;
    }
    .copy-btn {
      display: block;
      width: 100px;
      padding: 8px 12px;
      background: #007722;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin: 5px 0;
      font-size: 14px;
      transition: all 0.3s;
    }
    .copy-btn:hover {
      opacity: 1;
      transform: translateY(-2px) scale(1.05);
      box-shadow: 0 4px 12px rgba(0,119,34,0.4);
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .loading, .success, .error {
      padding: 8px;
      border-radius: 4px;
      margin-top: 10px;
      text-align: center;
      font-size: 12px;
    }
    .loading { background: #f0f9ff; color: #007722; }
    .success { background: #e6ffe6; color: #009900; }
    .error { background: #ffe6e6; color: #cc0000; }
  `;
  document.head.appendChild(style);

  // 创建按钮容器
  let btnGroup = document.createElement('div'); // 改为let声明
  btnGroup.className = 'copy-btn-group';
  btnGroup.innerHTML = `
    <button class="copy-btn" id="copyText">复制信息</button>
    <button class="copy-btn" id="copyImage">复制封面</button>
  `;

  document.body.insertAdjacentElement('afterbegin', btnGroup);

  // DOM观察器
  const btnObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      if (!document.contains(btnGroup)) {
        console.log('检测到容器被移除，重建按钮组');
        const newBtnGroup = btnGroup.cloneNode(true);
        document.documentElement.prepend(newBtnGroup);
        btnGroup = newBtnGroup;
        addEventListeners();
        initDrag(btnGroup); // 重新初始化拖拽功能
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

      const introSections = Array.from(document.querySelectorAll('.mod'))
        .flatMap(mod => {
          const header = mod.querySelector('h2');
          if (!header || !/内容简介|作者简介/.test(header.textContent)) return [];
          
          return Array.from(mod.querySelectorAll('p'))
            .map(p => p.textContent
              .replace(/[\s\u3000\u200B]+/g, ' ')
              .replace(/(\（.*?\）|\[\d+\]|【.*?】|展开全部|更多→|\u00a0)/g, '')
              .trim()
            )
            .filter(text => text.length > 30);
        });

      return {
        title,
        desc: introSections.join('\n\n') || '暂无简介'
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
  // 拖拽功能实现
  const initDrag = (container) => {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    const handleMove = (e) => {
      if (!isDragging) return;
      
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      
      let newLeft = initialLeft + dx;
      let newTop = initialTop + dy;
      
      // 边界限制
      const maxLeft = window.innerWidth - container.offsetWidth;
      const maxTop = window.innerHeight - container.offsetHeight;
      newLeft = Math.max(10, Math.min(newLeft, maxLeft - 10));
      newTop = Math.max(10, Math.min(newTop, maxTop - 10));
      
      container.style.left = `${newLeft}px`;
      container.style.top = `${newTop}px`;
    };

    const handleUp = () => {
      isDragging = false;
      container.style.opacity = '';
      container.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    container.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('copy-btn')) return;
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = container.offsetLeft;
      initialTop = container.offsetTop;
      container.style.opacity = '0.8';
      container.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
      e.preventDefault();
    });
  };

  // 初始化拖拽功能
  initDrag(btnGroup);
})();