// Product name in one place. Cordon is the product; "Mây Labs (giả định)" is the fictional demo company.
export const BRAND = { name: "Cordon", tagline: "Khoanh vùng quyền chi tiền cho người, AI và phần mềm", company: "Mây Labs (giả định)" } as const;
export const FOOTER_TEXT = "Cordon · Mây Labs là giả định · chạy trên Avalanche Fuji testnet · token test, không có giá trị";
/** Pages demo (VITE_API_MODE != live) runs the chain in the browser; the Fuji wording is only honest in live mode. */
export const FOOTER_TEXT_MOCK = "Cordon · Mây Labs là giả định · chain mô phỏng trong trình duyệt · contract thật trên Guardian L1 (Fuji), xem Bằng chứng · token test, không có giá trị";
