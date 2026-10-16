flowchart LR
  %% バス停
  subgraph BusStop["バス停（LoRa送信側）"]
    Edge1["ESP32\nバス停BLE検出①"]
    Edge2["ESP32\nバス停BLE検出②"]
    Module1["LoRa\nモジュール"]
    Antenna1["LoRa\nアンテナ"]

    Edge1 --- Edge2 --- Module1 --- Antenna1
  end

  %% 校舎

  subgraph Building["未来大校舎"]
    subgraph Receiver["LoRa受信側"]
      Antenna2[LoRa\nアンテナ]
      Module2[LoRa\nモジュール]

      Antenna2 --- Module2
    end

    %% 食堂
    subgraph Cafeteria["食堂"]
      Edge3["ESP32\n食堂BLE検出①"]
      Edge4["ESP32\n食堂BLE検出②兼ゲートウェイ"]

    end

    subgraph Signage["サイネージ設置場所（3階玄関付近）"]
      MiCom["Raspberry Pi"]
      Display["ディスプレイ"]

      MiCom --- Display
    end
  end

  %% クラウド
  subgraph CloudSpace["クラウド"]
    Cloud["Google Cloud Plattform"]
  end

  Antenna1 -.-|"LoRa（無線）"| Antenna2
  Module2 --- Edge4
  Edge3 --> Cloud
  Edge4 --> Cloud
  Cloud --> |"表示データ"| MiCom