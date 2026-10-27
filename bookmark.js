/* Browsers require a user gesture in their own UI to create bookmarks. */
(function(){
  const button=document.getElementById('bookmarkBtn'),dialog=document.getElementById('bookmarkDialog');
  if(!button||!dialog)return;
  function isChinese(){return typeof currentLang!=='function'||/^zh/.test(currentLang());}
  function labels(){
    const zh=isChinese();
    document.getElementById('bookmarkLabel').textContent=zh?'收藏本站':'Bookmark';
    document.getElementById('bookmarkTitle').textContent=zh?'收藏认官网':'Bookmark this site';
    document.getElementById('bookmarkClose').setAttribute('aria-label',zh?'关闭':'Close');
    const ua=navigator.userAgent;
    let tip;
    if(/iPhone|iPad|iPod/.test(ua)||(/Mac/.test(ua)&&navigator.maxTouchPoints>1))tip=zh?'点击浏览器的「分享」按钮，再选择「添加书签」或「添加到个人收藏」。':'Tap Share in your browser, then Add Bookmark or Add to Favorites.';
    else if(/Android/.test(ua))tip=zh?'打开浏览器右上角菜单，点击星标或「添加书签」。':'Open your browser menu, then tap the star or Add bookmark.';
    else{const shortcut=/Mac/.test(navigator.platform)?'⌘ + D':'Ctrl + D';tip=zh?'按 '+shortcut+'，然后确认，即可把认官网加入浏览器收藏夹。':'Press '+shortcut+' and confirm to bookmark this site.';}
    document.getElementById('bookmarkInstructions').textContent=tip;
  }
  labels();
  button.addEventListener('click',()=>{labels();if(!dialog.open)dialog.showModal();});
  document.getElementById('bookmarkClose').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>button.focus());
  document.getElementById('regionSel')?.addEventListener('change',labels);
})();
