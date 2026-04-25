import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateCapabilityKeyDto {
  @IsString()
  @IsNotEmpty({ message: 'Key 名称不能为空' })
  @MaxLength(100, { message: '名称长度不能超过 100 字符' })
  name: string;
}
