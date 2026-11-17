// Frozen Guardian L1 + Fuji C-Chain deployment (copied from Backend/deployments/fuji-l1.json, fuji-c.json and the
// seed roster). Static on purpose: it lets the page show addresses with no RPC (mock / GitHub Pages). Public addresses only.
export const L1_CHAIN_ID = 845357;
export const L1_DEPLOY_BLOCK = 1057;
export const CCHAIN_ID = 43113;
export const CCHAIN_RPC = "https://api.avax-test.network/ext/bc/C/rpc";
export const SNOWTRACE = "https://testnet.snowtrace.io";

export const TX_ALLOWLIST = "0x0200000000000000000000000000000000000002";
export const DEPLOYER_ALLOWLIST = "0x0200000000000000000000000000000000000000";
/** readAllowList(address) selector */
export const READ_ALLOW_LIST = "0xeb54dae1";

export interface NamedAddress { id: string; label: string; code: string; address: string }

export const L1_CONTRACTS: readonly NamedAddress[] = [
  { id: "registry", label: "Sổ đăng ký chủ khu và khoá", code: "PrincipalRegistry", address: "0xC92EcC9ED1D207Bae1ABb23Cef126Eb856B4aA71" },
  { id: "vault", label: "Kho chi tiêu (hạn mức, danh sách cho phép)", code: "PolicyVault", address: "0xe2459c0455dF46Fd16dB6d05C134AA480BEF9d53" },
  { id: "council", label: "Hội đồng 2/3", code: "GuardianCouncil", address: "0x09BaacAaFE18487e297f61859Aca6407cD8257bC" },
  { id: "mockDex", label: "Sàn đối tác (đáng tin)", code: "MockDex", address: "0x0F703493e1E375c96b34D2aC19AF426Fc227e035" },
  { id: "evilDex", label: "Sàn giả mạo (dùng để thử chặn)", code: "EvilDex", address: "0x2Baf7b874614A019f41583BDa0651aF88AC40cf6" },
  { id: "tUSDC", label: "Đồng thử tUSDC", code: "tUSDC", address: "0x6Da4eDe5723EFc770B42976556fF7aA8C3551eD4" },
  { id: "tTKB", label: "Đồng thử tTKB", code: "tTKB", address: "0x52A0b2d2d576Ea86a1B221F93Ae9fEf2a24F1641" },
  { id: "tSCAM", label: "Đồng lạ (không được phép)", code: "tSCAM", address: "0x253d4E90ADCb81E9309469798dbE35dbcB0a00D3" },
];

/** Built-in contracts of the L1 itself (no Solidity source), shown with the contracts but labelled as chain rules. */
export const L1_PRECOMPILES: readonly NamedAddress[] = [
  { id: "txAllowList", label: "Luật chặn gửi giao dịch (tầng giao thức)", code: "Tx AllowList", address: TX_ALLOWLIST },
  { id: "deployerAllowList", label: "Luật chặn đăng hợp đồng (tầng giao thức)", code: "Contract Deployer AllowList", address: DEPLOYER_ALLOWLIST },
];

/** anh Minh's district: his own key plus 3 agent keys and 1 payment-software key. */
export const MINH_KEYS: readonly NamedAddress[] = [
  { id: "key_minh", label: "Khoá anh Minh", code: "key_minh", address: "0xd5B1EDf1710CAEb8B9b5e6c77BE4Db7DCAEecC67" },
  { id: "key_agent_data", label: "Khoá Trợ lý Dữ liệu", code: "key_agent_data", address: "0xa03354D070EFa3922Ae74021f3731059C65BD269" },
  { id: "key_agent_intl_pay", label: "Khoá Trợ lý Thanh toán quốc tế", code: "key_agent_intl_pay", address: "0x576Cc913b7A658332a4B85aA87257750cad3bB2E" },
  { id: "key_agent_rebalance", label: "Khoá Trợ lý Cân đối", code: "key_agent_rebalance", address: "0xd1fA26ECd68A5CE5Fd81F19D5dAfff32098649Ec" },
  { id: "key_svc_payment", label: "Khoá phần mềm thanh toán", code: "key_svc_payment", address: "0xEd6d12320c8c53A2D059A4af14dCfDc0f340a1E2" },
];

export const COUNCIL_MEMBERS: readonly NamedAddress[] = [
  { id: "council_trang", label: "Hội đồng: chị Trang", code: "council_trang", address: "0x33A540bA630ef36c16887782CF73E4678149E51e" },
  { id: "council_lan", label: "Hội đồng: chị Lan", code: "council_lan", address: "0xa5d72AeeBC380251494215e44753E30E0730e36A" },
  { id: "council_huy", label: "Hội đồng: anh Huy", code: "council_huy", address: "0xf9eed7Fdd84cd3D31975846507ca95d2FF0C1e7F" },
];

export const DEPLOYER: NamedAddress = { id: "deployer", label: "Ví triển khai hợp đồng", code: "deployer", address: "0x6683cF6bA03d55127848361fc084B289DfCC812F" };

export const CCHAIN_FUNDS: readonly NamedAddress[] = [
  { id: "token", label: "Đồng GAI thử trên C-Chain", code: "token", address: "0x65954209aa3cf99eb77A90e55cD1dD3e94b1Fc02" },
  { id: "treasury", label: "Quỹ chung (ví đa chữ ký 3/5)", code: "treasury", address: "0xD000D0cE700B455A360C27c87A230F5A2c197D4D" },
  { id: "escrow", label: "Ví giữ tiền cầu nối", code: "escrow", address: "0xF9f119A52B11FB6b92a7fB87e3B775C17d91ef3A" },
];

export const snowtraceAddress = (a: string) => `${SNOWTRACE}/address/${a}`;
