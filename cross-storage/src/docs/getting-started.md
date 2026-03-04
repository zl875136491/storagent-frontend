# Storage Agent 跨区域存储系统使用引导

本系统用于统一管理 **区域（Region）**、**应用（Application）**、**MinIO 服务** 与 **存储桶（Bucket）**，并通过 **APIKey** 为调用方提供受控访问能力，帮助你快速搭建和运维跨区域对象存储能力。

## 核心概念

- **区域（Region）**：代表一个逻辑或物理区域，如“华东”“华北”等，主要用于对 MinIO 服务做分组与标识。
- **应用（Application）**：代表一个业务系统或子系统，例如“跨区域存储前端”“某业务线服务”等，可关联多个区域。
- **MinIO 服务**：指具体的 MinIO 实例，通常会挂在某个区域之下，用于实际存储对象数据。
- **存储桶（Bucket）**：MinIO 中的存储空间单位，用于组织具体的文件与目录。
- **APIKey**：发放给调用方的访问凭证，绑定到某个已授权的应用，用于在业务侧调用系统提供的接口。

理解以上概念，有助于你在使用界面时快速建立映射关系。

## 典型使用流程总览

1. **登录系统**
2. **配置区域（Region）**
3. **配置 MinIO 服务并关联区域**
4. **创建业务应用并关联区域**
5. **为应用授权**
6. **为应用创建 APIKey 并下发给调用方**
7. **通过「存储桶文件详情」查看各 MinIO 服务与 Bucket 的空间占用与目录结构**

下面按模块做更细致说明。

## 区域管理（RegionPage）

- 入口：导航中的「区域管理」。
- 功能：
  - 查看当前所有区域的列表信息（名称、简称、ID 等）。
  - 新建区域：填写 **区域名称**（如“华东区域”）和 **区域简称**（如“华东”）。
- 建议：
  - 按照实际机房、可用区或业务分区来设计区域，方便后续 MinIO 服务归类。

## 应用管理（ApplicationPage）

- 入口：导航中的「应用管理」。
- 功能：
  - 查看所有业务应用的基本信息、授权状态以及关联区域。
  - **新建应用**：填写名称、别名、描述，并至少选择一个关联区域。
  - **授权应用**：对未授权的应用执行授权操作，授权后才能为其创建 APIKey。
- 使用建议：
  - 一个应用通常对应一个业务系统；如果业务内部对权限隔离要求较高，可以拆分为多个应用。
  - 创建时务必补充清晰的描述，方便后续运维人员快速识别用途。

## 区域与 MinIO 服务（MinioPage）

> 具体页面实现请参考系统中的「MinIO 服务管理」页面，这里只做概念性说明。

- 典型能力：
  - 为某个区域配置一个或多个 MinIO 服务实例。
  - 维护 MinIO 连接信息（endpoint、访问凭证等）。
- 建议：
  - 同一区域的多个 MinIO 实例可以用于冗余或分流。
  - 在修改 MinIO 配置前，建议评估对现有 Bucket 与业务的影响。

## 存储桶文件详情（BucketPage）

- 入口：导航中的「存储桶文件详情」。
- 能力：
  - 按 MinIO 服务维度查看其下所有存储桶。
  - 使用树图（Treemap）直观展示各 Bucket 及其内部目录/文件的 **空间占用情况**。
  - 支持查看某个节点的完整路径与大小信息。
- 使用方式：
  1. 先在顶部卡片列表中选择一个 MinIO 服务。
  2. 下方区域会加载该服务下的所有 Bucket，并以树图展示。
  3. 鼠标悬停或点击树图中的块，可以查看对应目录/文件的路径和大小；使用上方路径导航可在层级间切换。
- 适用场景：
  - 定位大文件或大目录，排查空间异常增长。
  - 查看不同 Bucket 的整体容量占用。

## APIKey 管理（APIKeyPage）

- 入口：导航中的「APIKey 管理」。
- 前置条件：
  - 至少有一个 **已授权的应用**，否则无法创建 APIKey。
- 能力：
  - 查看现有 APIKey 列表：包括掩码后的 Key、ID、绑定应用、失效时间等信息。
  - 创建新的 APIKey：
    1. 打开「新建 APIKey」弹窗。
    2. 从列表中选择一个 **已授权的应用**。
    3. 可选设置失效日期（为空表示永久有效）。
    4. 确认创建。
  - 创建成功后，系统会弹出一个只展示一次的完整 APIKey 弹窗，支持一键复制。
- 注意事项：
  - **APIKey 只会完整展示一次**，关闭弹窗后无法再次查看原文，只能看到掩码形式。
  - 建议在复制后，立即将 Key 安全地写入调用方的配置中心或密钥管理系统。
  - 若复制失败，系统会提示需要手动选择复制。

## 典型场景示例：为新业务接入跨区域存储

1. 在「区域管理」中创建业务涉及的区域，例如“华东”“华北」。
2. 在「MinIO 服务管理」中，为各区域配置对应的 MinIO 服务实例。
3. 在「应用管理」中：
   - 创建一个新应用（例如：`cpl-frontend`），填写清晰的别名和描述。
   - 关联其需要访问的区域。
   - 提交并在列表中对该应用执行“授权”操作。
4. 在「APIKey 管理」中：
   - 打开“新建 APIKey”，选择刚才授权的应用。
   - 设置合适的失效时间（如三个月后），并生成 APIKey。
   - 将生成的 Key 安全下发给对应业务方。
5. 业务上线后，可通过「存储桶文件详情」观察不同 MinIO 服务及 Bucket 的空间占用情况，排查潜在容量风险。

## 在 Python 中使用 APIKey 示例

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

