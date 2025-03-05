import 'package:flutter/material.dart';
import 'widgets/custom_image_widget.dart';

void main() {
  runApp(MyApp());
}

class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(
          title: Text('Custom Image Widget Example'),
        ),
        body: Center(
          child: CustomImageWidget(
            imageUrl: 'https://example.com/your-image-url.jpg', // Replace with your image URL
          ),
        ),
      ),
    );
  }
}
