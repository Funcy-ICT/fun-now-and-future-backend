const getByte = (data: string, byte_location: number): string => {// hex文字列: 2文字 = 1バイト
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
            const length = parseInt(getByte(data, now_location), 16);// lengthは、BLEの[[長さ][型][中身]...(繰り返し)]のスキーマうち、[長さ]を抽出する。[長さ]は[型][中身]の合計の長さを示す。
            if (length === 0) break;// [長さ]が0の場合、[型][中身]が存在しないので、その時点でパースを終了する。
            const datatype = getByte(data, now_location + 1);
            if (datatype === "ff") {// [型]が0xffの場合、[中身]はCompany Specific Dataとわかる。
                companyId = getByte(data, now_location + 3) + getByte(data, now_location + 2);
                if (companyId === "004C") {// CompanyIDが"0x004C"の場合、Specific dataがApple continutityとわかる。
                    let apple_location = now_location + 4;// Apple continutityの[中身]の先頭位置を示す。
                    const end = now_location + 1 + length;
                    // Company Specific dataのApple continutityは[[型][長さ][中身]...(繰り返し)]と続いていく。
                    while (apple_location < end) {
                        const apple_type = getByte(data, apple_location);
                        const apple_length = parseInt(getByte(data, apple_location + 1), 16);
                        if (apple_type === "10") {// Apple continutityの[型]が0x10の場合、[中身]はNearby Infoとわかる。
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