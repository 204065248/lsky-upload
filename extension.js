// 模块'vscode'包含VS Code可扩展性API
// 导入模块，并在下面的代码中使用别名vscode引用它
const vscode = require("vscode");
const path = require("path");
const moment = require("moment");
const fs = require("fs");
const axios = require("axios");
const { spawn } = require("child_process");
const https = require("https");

var uploaded = false;
const config = vscode.workspace.getConfiguration("lsky");
// 当你的扩展被激活时，这个方法被调用
// 第一次执行命令时激活扩展名

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log("恭喜你，你的扩展“lsky-upload”现在是活跃的!");
  let disposable = vscode.commands.registerCommand("lsky-upload", function () {
    uploaded = false;
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Progress",
        cancellable: true,
      },
      (progress) => {
        return new Promise((resolve) => {
          uploaded = false;
          saveImg(progress);
          var intervalObj = setInterval(() => {
            if (uploaded) {
              setTimeout(() => {
                clearInterval(intervalObj);
                resolve();
              }, 1000);
            }
          }, 1000);
        });
      }
    );
  });

  context.subscriptions.push(disposable);

  let replaceImgUrlDisposable = vscode.commands.registerCommand(
    "replace-imgurl",
    () => {
      uploaded = false;
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Progress",
          cancellable: true,
        },
        (progress) => {
          return new Promise((resolve) => {
            uploaded = false;
            replaceImgUrl(progress);
            var intervalObj = setInterval(() => {
              if (uploaded) {
                setTimeout(() => {
                  clearInterval(intervalObj);
                  resolve();
                }, 1000);
              }
            }, 1000);
          });
        }
      );
    }
  );

  context.subscriptions.push(replaceImgUrlDisposable);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};

async function replaceImgUrl(progress) {
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No editor is active.");
    return;
  }

  let text = editor.document.getText();
  const regex = /\!\[.*\]\((.*?)\)/gi;
  let match, links;
  let total = 0; // 记录图片的总数
  let replaced = 0; // 记录替换成功的图片数量
  let offset = 0; // 记录替换的总长度
  let promises = []; // 用于并行处理所有替换操作的 Promise 数组

  while ((match = regex.exec(text)) !== null) {
    var imageUrl = match[1];
    var domainList = config["domainList"];
    if (
      domainList !== undefined &&
      domainList !== null &&
      domainList.includes(new URL(imageUrl).hostname)
    ) {
      console.log(`图片 ${imageUrl} 在 domainList 中，跳过`);
      continue;
    }
    console.log(`第 ${total + 1} 张图片地址: ` + imageUrl);
    total++;
    links = await getNewUrl(imageUrl, progress);
    if (links) {
      const start = match.index + offset; // 根据替换总长度计算实际位置
      const end = start + match[0].length;
      const range = new vscode.Range(
        editor.document.positionAt(start),
        editor.document.positionAt(end)
      );
      const promise = editor.edit((editBuilder) => {
        editBuilder.replace(range, links.markdown);
      });
      promises.push(promise);
      offset += links.markdown.length - match[0].length; // 记录替换的总长度
      replaced++;
    }
  }

  await Promise.all(promises); // 等待所有替换操作完成
  uploaded = true;
  vscode.window.showInformationMessage(
    `共 ${total} 张图片，成功替换 ${replaced} 张图片`
  );
}

async function getNewUrl(imageUrl, progress) {
  //let config = vscode.workspace.getConfiguration('lsky');
  let localPath = config["tempPath"];
  if (localPath && localPath.length !== localPath.trim().length) {
    progress.report({
      increment: 100,
      message: `本地临时保存图片路径未定义 ${localPath}`,
    });
    return;
  }
  try {
    let imagePath = await downloadImage(imageUrl, localPath);
    let links = await lskyUpload(config, imagePath, progress);
    return links;
  } catch (err) {
    progress.report({ increment: 100, message: "上传失败！" + err.message });
    return;
  }
}

function saveImg(progress) {
  // 获取当前编辑文件
  let editor = vscode.window.activeTextEditor;
  if (!editor) return;
  let fileUri = editor.document.uri;
  if (!fileUri) return;
  if (fileUri.scheme === "untitled") {
    progress.report({
      increment: 100,
      message: "需要先保存文件，才能粘贴图片",
    });
    return;
  }
  let selection = editor.selection;
  let selectText = editor.document.getText(selection);
  if (selectText && !/^[\w\-.]+$/.test(selectText)) {
    progress.report({ increment: 100, message: "选择的文本不是可用的文件名" });
    return;
  }
  //let config = vscode.workspace.getConfiguration('lsky');
  let localPath = config["tempPath"];
  if (localPath && localPath.length !== localPath.trim().length) {
    progress.report({
      increment: 100,
      message: `本地临时保存图片路径未定义 ${localPath}`,
    });
    return;
  }
  let filePath = fileUri.fsPath;
  let imagePath = getImagePath(filePath, selectText, localPath);
  createImageDirWithImagePath(imagePath)
    .then(() => saveClipboardImageToFileAndGetPath(imagePath, progress))
    .then((imagePath) => lskyUpload(config, imagePath, progress))
    .then((links) => {
      // console.log(links);
      editor.edit((textEditorEdit) => {
        textEditorEdit.insert(editor.selection.active, links.markdown);
      });
      progress.report({ increment: 100, message: "上传成功！" });
      uploaded = true;
    })
    .catch((err) => {
      progress.report({ increment: 100, message: "上传失败！" + err?.message });
    });
}

function lskyUpload(config, imagePath, progress) {
  progress.report({ increment: 20, message: "图片正在上传到图床..." });
  return new Promise(async (resolve, reject) => {
    let token = await getToken(config);
    if (!token || token.length === 0) {
      reject({ message: "token 获取失败" });
    }
    console.log("token=" + token);

    const file = fs.createReadStream(imagePath, { autoClose: true });
    const data = {
      strategy_id: config.strategyId,
      file,
    };
    const url = config.baseUrl + config.uploadPath;
    const auth = "Bearer " + token;
    const headers = {
      Authorization: auth,
      "Content-Type": "multipart/form-data",
      Accept: "application/json",
    };

    try {
      // @ts-ignore
      const res = await axios({
        url,
        method: "POST",
        headers,
        data,
      });

      console.log(res);
      if (res.status === 200) {
        if (Object.keys(res.data.data).length === 0) {
          reject(res);
        }
        resolve(res.data.data.links);
      } else {
        reject(res);
      }
    } catch (err) {
      console.log(err);
      reject(err);
    }
  });
}

async function getToken(config) {
  let token = config.token;
  if (!token) {
    const tokenUrl = config.baseUrl + config.tokenPath;
    console.log(tokenUrl);
    const data = {
      email: config.email,
      password: config.password,
    };

    try {
      // @ts-ignore
      const res = await axios({
        url: tokenUrl,
        method: "POST",
        data,
      });

      console.log(res);
      if (res.status === 200) {
        token = res.data.data.token;
      }
      vscode.workspace.getConfiguration().update("lsky.token", token, true);
    } catch (err) {
      console.log(err);
      token = null;
    }
  }
  return token;
}

function getImagePath(filePath, selectText, localPath) {
  // 图片名称
  let imageFileName = "";
  if (!selectText) {
    imageFileName = moment().format("YMMDDHHmmss") + ".png";
  } else {
    imageFileName = selectText + ".png";
  }

  // 图片本地保存路径
  let folderPath = path.dirname(filePath);
  let imagePath = "";
  if (path.isAbsolute(localPath)) {
    imagePath = path.join(localPath, imageFileName);
  } else {
    imagePath = path.join(folderPath, localPath, imageFileName);
  }
  return imagePath;
}

function createImageDirWithImagePath(imagePath) {
  return new Promise((resolve, reject) => {
    let imageDir = path.dirname(imagePath);
    fs.exists(imageDir, (exists) => {
      if (exists) {
        resolve(imagePath);
        return;
      }
      fs.mkdir(imageDir, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(imagePath);
      });
    });
  });
}

function saveClipboardImageToFileAndGetPath(imagePath, progress) {
  return new Promise((resolve, reject) => {
    progress.report({ increment: 20, message: "将剪贴板图片保存到本地..." });
    if (!imagePath) {
      reject(new Error("imagePath不能为空！"));
      return;
    }
    let platform = process.platform;
    if (platform === "win32") {
      // Windows
      const scriptPath = path.join(__dirname, "./lib/pc.ps1");
      const powershell = spawn("powershell", [
        "-noprofile",
        "-noninteractive",
        "-nologo",
        "-sta",
        "-executionpolicy",
        "unrestricted",
        "-windowstyle",
        "hidden",
        "-file",
        scriptPath,
        imagePath,
      ]);
      powershell.on("exit", function (code, signal) {
        if (code === 0) {
          console.log("PowerShell command executed successfully.");
        } else {
          console.error(`PowerShell command failed with exit code ${code}.`);
        }
      });
      powershell.stdout.on("data", function (data) {
        resolve(data.toString().trim());
      });
      powershell.on("error", (err) => {
        console.error("Failed to start PowerShell.", err);
      });
    } else if (platform === "darwin") {
      // Mac
      let scriptPath = path.join(__dirname, "./lib/mac.applescript");

      let ascript = spawn("osascript", [scriptPath, imagePath]);
      ascript.on("exit", function (code, signal) {});

      ascript.stdout.on("data", function (data) {
        resolve(data.toString().trim());
      });
    } else {
      // Linux

      let scriptPath = path.join(__dirname, "./lib/linux.sh");

      let ascript = spawn("sh", [scriptPath, imagePath]);
      ascript.on("exit", function (code, signal) {});

      ascript.stdout.on("data", function (data) {
        let result = data.toString().trim();
        if (result == "no xclip") {
          reject(new Error("需要先安装 xclip 命令！"));
          return;
        }
        resolve(result);
      });
    }
  });
}
function isUrl(str) {
  return /[a-zA-z]+:\/\/[^\s]*/.test(str);
}
async function downloadImage(imageUrl, localPath) {
  // 获取当前编辑文件
  let editor = vscode.window.activeTextEditor;
  if (!editor) return "";
  let fileUri = editor.document.uri;
  if (!fileUri) return "";
  if (fileUri.scheme === "untitled") {
    progress.report({
      increment: 100,
      message: "需要先保存文件，才能批量上传图片",
    });
    return "";
  }
  // @ts-ignore
  if (!isUrl(imageUrl)) {
    // let filePath = fileUri.fsPath;
    // let imagePath = getImagePath(filePath, selectText, localPath);
    return imageUrl;
  }
  const response = await axios({
    url: imageUrl,
    method: "GET",
    responseType: "stream",
    headers: {
      Accept: "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });

  const contentType = response.headers["content-type"];
  // 判断是否是图片
  if (!contentType.startsWith("image/")) {
    return "";
  }

  let extension = ".png"; // 默认后缀为 .jpg
  if (contentType.startsWith("image/")) {
    extension = "." + contentType.substring("image/".length);
  }

  const imageFileName = moment().format("YMMDDHHmmss") + extension;
  // 图片本地保存路径
  let filePath = fileUri.fsPath;
  let folderPath = path.dirname(filePath);
  let imagePath = "";
  if (path.isAbsolute(localPath)) {
    imagePath = path.join(localPath, imageFileName);
  } else {
    imagePath = path.join(folderPath, localPath, imageFileName);
  }

  const writer = fs.createWriteStream(imagePath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => {
      resolve(imgPath);
    });

    writer.on("error", reject);
  });
}

function preHandleUrl(imageUrl) {
  if (imageUrl.includes("img-blog.csdn.net")) {
    // 检查字符串是否包含 "img-blog.csdn.net"
    imageUrl = imageUrl.split("?")[0]; // 使用 split() 方法获取 "?" 前的字符串
    console.log("csdn 去水印图片地址: " + imageUrl);
  }
  return imageUrl;
}
