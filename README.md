# 认官网 RGW · Recognize Genuine Websites

[English](./README.en.md)

**认准官网，访问不迷路。**

认官网是一个人工精选的官网导航站：只收录人工打开验证过的官方网站，帮你避开山寨站、钓鱼站和捆绑下载。

🌐 在线访问：https://renguanwang.com

## 数据规模

- **11542** 个官网
- **184** 个国家/地区
- **15** 个分类（装机必备、AI 工具、办公效率、开发工具……）
- **24** 种界面语言（跟随所选国家自动切换）

## 理念

- 只收录人工核验过的官网，不收下载站、镜像站、山寨站
- 每个站点标注真实域名、一句话说明、价格
- 推广位会明确标注，不影响自然排序

## 本地运行

这是纯静态站，直接用浏览器打开 `index.html` 即可预览（部分功能需要 HTTP 服务）：

```bash
cd renguanwang
python3 -m http.server 8000
# 打开 http://localhost:8000
```

## 如何贡献

欢迎提交 PR！详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

- **补站**：提交你验证过的官网（需附证据）
- **补翻译**：完善 24 种语言的界面文案
- **修 bug / 加功能**：提 Issue 或直接 PR

## 开源协议

- 网站代码：[MIT](./LICENSE)
- 站点数据（`sites.js`）：[CC BY 4.0](./LICENSE)，转载请署名「认官网 renguanwang.com」

## 联系

- Telegram 群：https://t.me/renguanwang
- 微信公众号：小产品实验室
- 反馈：网站右上角「反馈」入口

## 支持作者

如果认官网帮到了你，欢迎请作者喝杯咖啡 ☕

| 微信打赏 | 支付宝打赏 | USDT (TRC20) |
|---------|----------|--------------|
| <img src="./donate-wechat.png" width="180"> | <img src="./donate-alipay.png" width="180"> | <img src="./donate-usdt.png" width="180"> |

USDT 地址：`TSAdZm2yNMZCpmd8ussPgrg7pnNYdv9epH`

## 搜索区天气背景

`functions/api/weather.js` 使用服务端 Apple WeatherKit，密钥只配置在 Cloudflare Pages Secrets 中，禁止提交到仓库。所需变量：`APPLE_TEAM_ID`、`APPLE_KEY_ID`、`APPLE_SERVICE_ID`、`APPLE_WK_PRIVATE_KEY`。

`weather.js` 根据天气和当地日出日落设置晴、多云、雾、雨、雪、夜间及晨昏背景。默认使用所选国家首都；无选择时使用 IP 国家首都。主动定位可查询设备位置；自定义城市最多 4 个（加首都共 5 项），保存在浏览器。城市搜索使用 Open-Meteo / GeoNames，天气仍由 Apple WeatherKit 提供。每 15 分钟刷新天气，每分钟检查晨昏切换；失败恢复普通搜索背景。
