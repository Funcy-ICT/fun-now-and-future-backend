const getByte = (data: string, byte_location: number): string => {
    return data.slice(byte_location * 2, byte_location * 2 + 2);
};

export const parseRawData = (a: string[]): [string[], string[]] => {
    const companyIds: string[] = [];
    const nearbyInfos: string[] = [];

    for (const data of a) {
        let companyId = "";
        let nearbyInfo = "";
        let now_location = 0;

        while (now_location < data.length / 2) {
            const length = parseInt(getByte(data, now_location), 16);
            if (length === 0) break;
            const datatype = getByte(data, now_location + 1);
            if (datatype === "ff") {
                companyId = getByte(data, now_location + 3) + getByte(data, now_location + 2);
                if (companyId === "4c00") {
                    let apple_location = now_location + 4;
                    const end = now_location + 1 + length;
                    // [[型][長さ][中身]...] と続いていく
                    while (apple_location < end) {
                        const apple_type = getByte(data, apple_location);
                        const apple_length = parseInt(getByte(data, apple_location + 1), 16);
                        if (apple_type === "10") {
                            nearbyInfo = "10";
                        }
                        apple_location = apple_location + 2 + apple_length;
                    }
                }
                break;
            }
            now_location = now_location + 1 + length;
        }
        companyIds.push(companyId);
        nearbyInfos.push(nearbyInfo);
    }
    return [companyIds, nearbyInfos];
};