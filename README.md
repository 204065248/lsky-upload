# lsky-upload

可以在 vscode 编写 markdown 笔记时，很方便的上传图片到自己的 lsky 图床。

最最最强大的地方在于，可以批量将 markdown 其他来源的图片上传到自己的图床，并替换地址。

## v1.0.3

- 增加参考式链接转行内式链接
- 增加一键去除参考式定义链接

## 配置

- baseUrl：lsky 图床地址
- email：用户名
- password：密码
- tempPath：本地图片临时存放路径
- token：如果已经获取过 token，可直接填入，留空则自动获取
- tokenPath：获取 token 的接口路径，默认 /api/v1/tokens
- uploadPath：上传的接口路径，默认 /api/v1/upload
- strategyId：图床的储存策略 id，可以在后台中管理界面查看，默认 1
- domainList：如果图片域名包含在内，就不进行上传替换，多个域名以英文逗号分隔
- keepLocalPict: 是否保留本地图片

必填：Base Url，Email，Password。

```
如返回 401 错误，请确认填写的 token 是否正确。
如返回 404 错误，请确认填写的 api 路径是否正确
```
