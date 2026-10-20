# Pour ma chère Mlle Dong · Winter Edition

一个用 Three.js 写的冬日小页面。飘雪、发光的小圣诞树、慢慢浮起来的心，背景是淡蓝到浅灰的冬夜渐变。

写给我家 Dong 小姐的圣诞礼物，仅此而已。

## 在线体验

🔗 https://12321-hazel.vercel.app

手机和电脑浏览器都能打开。

## 它是怎么跑起来的

- 单文件 `index.html`，没有构建步骤，没有依赖安装
- Three.js 通过 esm.sh 直接 import
- 粒子系统画雪和树，UnrealBloomPass 做发光
- 部署在 Vercel，push 到 main 自动上线

## 本地跑

随便起个静态服务器就行：

```bash
npx serve .
```

## 写在最后

代码是我写的，但页面上那句 Joyeux Noël 是真心的。
