## 开发人员使用指南

### 使用流程总览

1. 登录系统
2. 创建应用
3. 等待管理员授权
4. 创建 APIKey
5. 将 APIKey 下发给开发人员
6. 开发人员使用 APIKey 调用接口

### 创建应用

1. 在应用管理页面，点击“新建应用”按钮
2. 填写应用名称、别名、描述
3. 选择关联区域
4. 点击“提交”按钮
5. 等待管理员授权

### 创建 APIKey

1. 在 APIKey 管理页面，点击“新建 APIKey”按钮
2. 选择已授权的应用
3. 设置失效时间
4. 点击“提交”按钮
5. 等待管理员创建 APIKey
6. 将 APIKey 下发给开发人员
7. 开发人员使用 APIKey 调用接口

### 使用 APIKey 调用接口

1. 在 APIKey 管理页面，点击“新建 APIKey”按钮
2. 选择已授权的应用
3. 设置失效时间
 
下面是一个在 Python 代码中调用 Storage Agent 后端接口的示例，演示如何通过 `Authorization` 请求头携带 APIKey：

```python
import os
import requests

# 建议从环境变量中读取 APIKey，而不是写死在代码中
API_KEY = os.environ.get("CROSS_STORAGE_API_KEY", "<your-apikey-here>")

BASE_URL = "https://your-cross-storage-domain.example.com"


def list_buckets():
    url = f"{BASE_URL}/api/buckets"
    headers = {
        # 约定使用 Bearer 形式传递 APIKey，如果你的后端使用的是其他格式，请调整这里
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }

    response = requests.get(url, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json()


if __name__ == "__main__":
    try:
        data = list_buckets()
        print("Buckets:", data)
    except requests.HTTPError as exc:
        print("调用 Storage Agent 接口失败:", exc.response.status_code, exc.response.text)
```

### 注意事项

1. APIKey 只会完整展示一次，关闭弹窗后无法再次查看原文，只能看到掩码形式。
2. 建议在复制后，立即将 Key 安全地写入调用方的配置中心或密钥管理系统。
3. 若复制失败，系统会提示需要手动选择复制。